import { Client } from "@colyseus/core";
import { logger } from "../lib/logger.js";
import type { ActionPayload } from "../messages/schemas.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import {
  bettingRoundComplete,
  eligibleToAct,
  noFurtherBettingPossible,
} from "./rules/BettingRound.js";
import { PokerError } from "./errors.js";
import { PersistenceFacade } from "./persistence/PersistenceFacade.js";
import { nanoid } from "nanoid";
import { type TableLastAction, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { RandomBotBrain } from "./bots/BotBrain.js";
import type { BotBrain } from "./bots/BotBrain.js";
import { SnapshotService, type SnapshotReason } from "./dealer/services/SnapshotService.js";
import { ActionService, type ActionResult, type ActionServiceLastAction, type ActionDebitKind } from "./dealer/services/ActionService.js";
import { SettlementService } from "./dealer/services/SettlementService.js";
import { HandLifecycleService, type HandLifecyclePlan } from "./dealer/services/HandLifecycleService.js";
import { TurnAutomationService } from "./dealer/services/TurnAutomationService.js";
import { PlayerLifecycleService, type PlayerLifecyclePlan } from "./dealer/services/PlayerLifecycleService.js";
import { ActionOptionsService } from "./dealer/services/ActionOptionsService.js";
import type { FrameReason } from "./replay/FrameReason.js";
import {
  countNonOutPlayers,
  countNotFoldedPlayers,
  findNextToActSeat,
} from "./dealer/utils/TableNavigator.js";
import { NEXT_HAND_DELAY_MS } from "./dealer/timing.js";
import { maybeAssertBettingState } from "./invariants/assertBettingState.js";
/**
 * v3.0 Dealer (final milestone):
 * - Side pots + showdown payout
 * - Betting-round settlement via needsAction flags
 * - Multiway equity w/ warmup + in-flight de-dup + throttle
 * - Typed errors for clean client UX
 */
export class Dealer {
  private readonly state: PokerState;
  private readonly persistence: PersistenceFacade;
  private readonly clientsByUserId: Map<string, Client> = new Map();

  private holeCardsByPlayerId: Map<string, string[]> = new Map();
  private pendingSeatReleaseUserIds: Set<string> = new Set();
  private lastHandResult: TableSnapshotPayload["lastHandResult"] | undefined = undefined;
  private lastAction: TableSnapshotPayload["lastAction"] | undefined = undefined;
  private readonly botBrain: BotBrain = new RandomBotBrain();
  private readonly autoActionsByUserId: Map<string, number> = new Map();
  private readonly currentHandAutoActedUserIds: Set<string> = new Set();
  private readonly onAutoSitOutReachedCap?: (args: { userId: string; stackCents: number }) => Promise<void> | void;
  private readonly snapshotService: SnapshotService;
  private readonly actionService = new ActionService();
  private readonly settlementService: SettlementService;
  private readonly handLifecycleService: HandLifecycleService;
  private readonly turnAutomationService: TurnAutomationService;
  private readonly playerLifecycleService: PlayerLifecycleService;
  private readonly actionOptionsService = new ActionOptionsService();

  private actionQueue: Promise<void> = Promise.resolve();
  private readonly processedActionIds: Set<string> = new Set();
  private disconnectSweepIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    state: PokerState,
    persistence?: PersistenceFacade,
    options?: {
      onAutoSitOutReachedCap?: (args: { userId: string; stackCents: number }) => Promise<void> | void;
      onTableSnapshotEmitted?: (args: {
        tableId: string;
        handId?: string;
        snapshotId: string;
        reason: SnapshotReason;
        frameReason?: FrameReason;
        street: string;
        payloadJson: TableSnapshotPayload;
        stateHash: string;
        schemaVersion: number;
      }) => Promise<void> | void;
    },
  ) {
    this.state = state;
    this.persistence = persistence ?? new PersistenceFacade(this.state.tableId || "table_poc");
    this.onAutoSitOutReachedCap = options?.onAutoSitOutReachedCap;
    this.settlementService = new SettlementService({
      state: this.state,
      persistence: this.persistence,
    });
    this.handLifecycleService = new HandLifecycleService({
      state: this.state,
      persistence: this.persistence,
      settlementService: this.settlementService,
      holeCardsByPlayerId: this.holeCardsByPlayerId,
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      processedActionIds: this.processedActionIds,
      applyDisconnectedAutoActionCapForHand: () => this.applyDisconnectedAutoActionCapForHand(),
      setLastHandResult: (value) => { this.lastHandResult = value; },
      setLastAction: (value) => { this.lastAction = value; },
    });
    this.turnAutomationService = new TurnAutomationService({
      state: this.state,
      botBrain: this.botBrain,
      autoActionsByUserId: this.autoActionsByUserId,
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      enqueueAction: (userId, payload, delayMs) => this.enqueueInternalAction(userId, payload, delayMs),
      onAutoSitOutReachedCap: this.onAutoSitOutReachedCap,
    });
    this.playerLifecycleService = new PlayerLifecycleService({
      state: this.state,
      persistence: this.persistence,
      pendingSeatReleaseUserIds: this.pendingSeatReleaseUserIds,
      autoActionsByUserId: this.autoActionsByUserId,
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      holeCardsByPlayerId: this.holeCardsByPlayerId,
      ensurePlayerPersistence: (player) => this.ensurePlayerPersistence(player),
      forceFoldIfInHand: (userId) => this.forceFoldForLeave(userId),
    });
    this.snapshotService = new SnapshotService({
      state: this.state,
      clientsByUserId: this.clientsByUserId,
      holeCardsByPlayerId: this.holeCardsByPlayerId,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      getLastHandResult: () => this.lastHandResult,
      getLastAction: () => this.lastAction,
      emitHook: options?.onTableSnapshotEmitted,
    });
    this.startDisconnectSweep();
    if (this.state.seats.length === 0) {
      for (let i = 0; i < (this.state.maxSeats || 9); i++) this.state.seats.push("");
    }
  }

  bindClient(userId: string, client: Client) { this.clientsByUserId.set(userId, client); }
  unbindClient(userId: string) { this.clientsByUserId.delete(userId); }
  getClient(userId: string) { return this.clientsByUserId.get(userId); }
  hasPlayer(userId: string) { return this.state.playersById.has(userId); }
  emitSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToUser(userId, reason, actionId);
  }
  emitSnapshotsToAll(reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToAll(reason, actionId);
  }

  async addPlayer(userId: string, name: string, buyInCents: number) {
    const plans = await this.playerLifecycleService.addPlayer(userId, name, buyInCents);
    await this.executePlayerLifecyclePlans(plans);
  }

  async restorePlayerFromSession(
    userId: string,
    name: string,
    seat: number,
    stackCents: number,
    options?: { connected?: boolean; sittingOut?: boolean },
  ) {
    const plans = await this.playerLifecycleService.restorePlayerFromSession(userId, name, seat, stackCents, options);
    await this.executePlayerLifecyclePlans(plans);
  }

  async addBot(botId: string, name: string, buyInCents: number) {
    const plans = await this.playerLifecycleService.addBot(botId, name, buyInCents);
    await this.executePlayerLifecyclePlans(plans);
  }

  async removeBot(botId: string) {
    const plans = await this.playerLifecycleService.removeBot(botId);
    await this.executePlayerLifecyclePlans(plans);
  }

  async removePlayer(userId: string, options?: { cashOutAfterRemoval?: boolean }) {
    const plans = await this.playerLifecycleService.removePlayer(userId, options);
    await this.executePlayerLifecyclePlans(plans);
  }

  /** Add chips to seated player (rebuy). Ledger must already be updated via economy buy-in. */
  async applyRebuy(userId: string, amountCents: number): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addChipsToSeatedPlayer(userId, amountCents);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async handleConsentedLeave(userId: string) {
    await this.forceFoldForLeave(userId);
    await this.removePlayer(userId, { cashOutAfterRemoval: true });
  }

  markDisconnected(userId: string, disconnectDeadlineTs: number) {
    const plans = this.playerLifecycleService.markDisconnected(userId, disconnectDeadlineTs);
    this.runPlayerLifecyclePlansFireAndForget(plans);
  }

  markReconnected(userId: string) {
    const plans = this.playerLifecycleService.markReconnected(userId);
    this.runPlayerLifecyclePlansFireAndForget(plans);
  }

  async markAbandoned(userId: string) {
    const plans = await this.playerLifecycleService.markAbandoned(userId);
    await this.executePlayerLifecyclePlans(plans);
  }

  async markDisconnectedSerialized(userId: string, disconnectDeadlineTs: number): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = this.playerLifecycleService.markDisconnected(userId, disconnectDeadlineTs);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async markReconnectedSerialized(userId: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = this.playerLifecycleService.markReconnected(userId);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async markAbandonedSerialized(userId: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.markAbandoned(userId);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async kickUser(userId: string, reason: string) {
    const client = this.clientsByUserId.get(userId);
    if (client) {
      try {
        client.leave();
      } catch {}
    }
    await this.markAbandoned(userId);
  }
  async handleAction(userId: string, msg: ActionPayload, actionId?: string) {
    // Action serialization queue (mutex)
    return this.actionQueue = this.actionQueue.then(async () => {
      if (actionId && this.processedActionIds.has(actionId)) {
        return;
      }
      const handIdBefore = this.state.handId;
      try {
        await this._handleAction(userId, msg, "PLAYER");
        if (actionId && handIdBefore && this.state.handId === handIdBefore) {
          this.processedActionIds.add(actionId);
        }
      } catch (err) {
        logger.error({ err, userId, action: msg.action }, "Action failed");
        throw err;
      }
    });
  }

  private async _handleAction(userId: string, msg: ActionPayload, origin: TableLastAction["origin"]) {
    const execution = await this.actionService.execute({
      state: this.state,
      userId,
      msg,
      origin,
      recordAcceptedAction: (args) => this.settlementService.recordAcceptedAction(args),
      assertCanAfford: (player, amountCents) => this.settlementService.assertCanAfford(player, amountCents),
      applyActionDebit: async (p: PlayerState, amountCents: number, action: ActionDebitKind) => {
        await this.settlementService.applyActionDebit(p, amountCents, action);
      },
    });

    this.setLastActionFromExecution(execution.lastAction);
    await this.applyActionResult(execution.result, {
      turnAdvancedReason: execution.result.kind === "TURN_ADVANCED" && execution.result.actorKind === "BOT"
        ? "BOT_ACTION"
        : "ACTION_ACCEPTED",
    });
  }

  private setLastActionFromExecution(lastAction: ActionServiceLastAction | undefined): void {
    if (!lastAction) return;
    const nextSeq = this.state.handActionSeq + 1;
    this.state.handActionSeq = nextSeq;
    this.lastAction = {
      ...lastAction,
      seq: nextSeq,
    };
  }

  // -------------------------
  // Hand lifecycle
  // -------------------------

  private async startHand() {
    const plans = await this.handLifecycleService.startHand();
    await this.executeHandLifecyclePlans(plans);
  }

  private async advanceStreetOrShowdown() {
    
    const plans = await this.handLifecycleService.advanceStreetOrShowdown();
    await this.executeHandLifecyclePlans(plans);
  }

  private async finishHandByLastStanding() {
    
    const plans = await this.handLifecycleService.finishHandByLastStanding();
    await this.executeHandLifecyclePlans(plans);
  }
  private async finishHandShowdownWithSidePots() {
    const plans = await this.handLifecycleService.finishHandShowdownWithSidePots();
    await this.executeHandLifecyclePlans(plans);
  }

  private async executeHandLifecyclePlans(plans: HandLifecyclePlan[]): Promise<void> {
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          this.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "DELAY":
          await new Promise((resolve) => setTimeout(resolve, plan.ms));
          break;
        case "MAYBE_AUTOMATE_TURN":
          this.maybeActForBot();
          break;
        case "TRANSITION_TO_WAITING":
          this.state.street = "WAITING";
          this.state.runoutMode = "NONE";
          this.processedActionIds.clear();
          break;
        case "RELEASE_PENDING_SEATS":
          await this.releasePendingSeats();
          break;
        case "SCHEDULE_NEXT_HAND":
          this.scheduleNextHand(plan.reason, plan.delayMs ?? 0);
          break;
      }
    }
  }

  private async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[]): Promise<void> {
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          this.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "MAYBE_AUTOMATE_TURN":
          this.maybeActForBot();
          break;
        case "START_HAND":
          await this.startHand();
          break;
        case "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL":
          await this.ensureHandAdvancingAfterPlayerRemoval(plan.removedSeat);
          break;
        case "RELEASE_PENDING_SEATS":
          await this.releasePendingSeats();
          break;
        case "FINISH_HAND_BY_LAST_STANDING":
          await this.finishHandByLastStanding();
          break;
        case "ADVANCE_STREET_OR_SHOWDOWN":
          await this.advanceStreetOrShowdown();
          break;
      }
    }
  }

  private runPlayerLifecyclePlansFireAndForget(plans: PlayerLifecyclePlan[]): void {
    void this.executePlayerLifecyclePlans(plans).catch((err) => {
      logger.error({ err }, "Player lifecycle plan execution failed");
    });
  }

  private async ensureHandAdvancingAfterPlayerRemoval(removedSeat: number) {
    if (this.state.street === "WAITING") {
      if (countNonOutPlayers(this.state) >= 2) await this.startHand();
      return;
    }
    if (this.state.runoutMode === "STAGED") return;

    if (countNotFoldedPlayers(this.state) <= 1) {
      await this.finishHandByLastStanding();
      return;
    }

    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
        await this.advanceStreetOrShowdown();
      } else {
        const nextSeat = findNextToActSeat(this.state, removedSeat);
        if (nextSeat === -1) {
          await this.advanceStreetOrShowdown();
          return;
        }
        this.state.toActSeat = nextSeat;
        this.maybeActForBot();
      }
    } else {
      this.maybeActForBot();
    }
  }

// -------------------------
// Hand lifecycle helpers
// -------------------------
private nextHandScheduled = false;

  private scheduleNextHand(reason: string, delayMs = 0) {
    if (this.nextHandScheduled) return;
    this.nextHandScheduled = true;
    const countdownMs = NEXT_HAND_DELAY_MS;

    setTimeout(() => {
      this.state.nextHandAtTs = Date.now() + countdownMs;
      // Emit snapshot so clients see the countdown after result-hold window.
      this.sendTableSnapshotToAll("AUTO_TRANSITION");

      setTimeout(() => {
        this.nextHandScheduled = false;
        this.state.nextHandAtTs = 0;

        const seated = [...this.state.playersById.values()]
          .filter(p => p.seat >= 0 && p.status !== "OUT");

        if (this.state.street === "WAITING" && seated.length >= 2) {
          this.startHand().catch((err) => {
            logger.error({ err, reason }, "Failed to auto-start next hand");
          });
        } else {
          // If we still cannot start (e.g. players left), ensure clients know we are WAITING
          this.sendTableSnapshotToAll("AUTO_TRANSITION");
        }
      }, countdownMs);
    }, delayMs);
  }

  private async releasePendingSeats() {
    const toRelease = [...this.pendingSeatReleaseUserIds];
    this.pendingSeatReleaseUserIds.clear();
    for (const userId of toRelease) {
      await this.removePlayer(userId);
    }
  }

  private async forceFoldForLeave(userId: string): Promise<void> {
    const execution = await this.actionService.executeForcedFold({
      state: this.state,
      userId,
      origin: "FORCED",
      recordAcceptedAction: (args) => this.settlementService.recordAcceptedAction(args),
    });
    this.setLastActionFromExecution(execution.lastAction);
    await this.applyActionResult(execution.result, { turnAdvancedReason: "ACTION_ACCEPTED" });
  }

  private async applyActionResult(
    result: ActionResult,
    options?: { turnAdvancedReason?: SnapshotReason },
  ): Promise<void> {
    switch (result.kind) {
      case "NO_OP":
        return;
      case "WAITING_FOR_PLAYERS":
        this.sendTableSnapshotToAll("AUTO_TRANSITION");
        maybeAssertBettingState(this.state);
        return;
      case "HAND_FINISHED":
        await this.finishHandByLastStanding();
        maybeAssertBettingState(this.state);
        return;
      case "STREET_COMPLETE":
        await this.advanceStreetOrShowdown();
        maybeAssertBettingState(this.state);
        return;
      case "TURN_ADVANCED":
        this.sendTableSnapshotToAll(options?.turnAdvancedReason ?? "ACTION_ACCEPTED", `act_${this.state.handId}_${nanoid(8)}`);
        maybeAssertBettingState(this.state);
        this.maybeActForBot();
        return;
    }
  }

  private async ensurePlayerPersistence(p: PlayerState) {
    if (!this.persistence.enabled || !this.persistence.handHistory || !this.persistence.ledger) return;
    try {
      const roster = this.buildHandHistoryRoster();
      await this.persistence.handHistory.ensureTableAndPlayers(roster);
      await this.persistence.ledger.ensureBalances([p.id], { [p.id]: 0 });
    } catch (err) {
      logger.warn({ err, userId: p.id }, "player persistence ensure failed; continuing in-memory");
    }
  }

  /** Full table roster for HandHistoryService (must include all seated players so resolvePlayerId works). */
  private buildHandHistoryRoster(): { id: string; name: string; seat: number; userId: string | null }[] {
    return [...this.state.playersById.values()]
      .filter((pl) => pl.seat >= 0)
      .map((pl) => ({
        id: pl.id,
        name: pl.name,
        seat: pl.seat,
        userId: pl.kind === "HUMAN" ? pl.userId || pl.id : null,
      }));
  }

  // -------------------------
  // Helpers
  // -------------------------

  /**
   * Automation hook for non-human turn blocking:
   * - bots take a delayed action via BotBrain
   * - disconnected humans auto-check when legal, otherwise auto-fold
   */
  private maybeActForBot(): void {
    this.turnAutomationService.maybeActForBot();
  }

  private enqueueInternalAction(userId: string, payload: ActionPayload, delayMs = 0): void {
    this.actionQueue = this.actionQueue.then(async () => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Skip auto-action if a human reconnected in the meantime
      const p = this.state.playersById.get(userId);
      if (p && p.kind !== "BOT" && p.connected) {
        logger.info({ userId, action: payload.action }, "Skipping queued auto-action; player reconnected");
        return;
      }

      await this._handleAction(userId, payload, "AUTO");
    }).catch((err) => {
      if (this.isSkippableQueuedActionError(err)) {
        logger.warn(
          { err, userId, action: payload.action, street: this.state.street },
          "Queued auto-action skipped after state changed",
        );
        return;
      }
      logger.error({ err, userId, action: payload.action }, "Queued auto-action failed");
    });
  }

  private isSkippableQueuedActionError(err: unknown): boolean {
    if (!(err instanceof PokerError)) return false;
    return err.code === "HAND_NOT_STARTED" || err.code === "NOT_YOUR_TURN" || err.code === "NOT_ELIGIBLE";
  }

  private async applyDisconnectedAutoActionCapForHand() {
    await this.turnAutomationService.applyDisconnectedAutoActionCapForHand();
  }

  private enqueueSerializedStateMutation(work: () => Promise<void>): Promise<void> {
    const queued = this.actionQueue
      .catch((err) => {
        logger.warn({ err }, "Recovering dealer queue after prior failure");
      })
      .then(work);
    this.actionQueue = queued;
    return queued;
  }

  private static readonly DISCONNECT_SWEEP_MS = 10_000;

  private startDisconnectSweep(): void {
    if (this.disconnectSweepIntervalId != null) return;
    this.disconnectSweepIntervalId = setInterval(() => {
      void this.sweepDisconnectDeadlines();
    }, Dealer.DISCONNECT_SWEEP_MS);
  }

  stopDisconnectSweep(): void {
    if (this.disconnectSweepIntervalId != null) {
      clearInterval(this.disconnectSweepIntervalId);
      this.disconnectSweepIntervalId = null;
    }
  }

  private async sweepDisconnectDeadlines(): Promise<void> {
    const now = Date.now();
    const toAbandon: string[] = [];
    for (const [userId, player] of this.state.playersById.entries()) {
      if (player.disconnectDeadlineTs > 0 && now > player.disconnectDeadlineTs) {
        toAbandon.push(userId);
      }
    }
    for (const userId of toAbandon) {
      try {
        await this.markAbandoned(userId);
      } catch (err) {
        logger.warn({ err, userId }, "disconnect sweep markAbandoned failed");
      }
    }
  }

  private sendTableSnapshotToAll(reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToAll(reason, actionId);
  }

  private sendTableSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToUser(userId, reason, actionId);
  }

}
