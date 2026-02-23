/**
 * ============================================================================
 * Dealer - Poker Table State Machine & Action Gateway
 * ============================================================================
 * 
 * Core responsibility: Manages the complete lifecycle of a poker table,
 * from player management to hand execution and state persistence.
 *
 * Architecture Overview:
 * =====================
 * - Owns PokerState (persistent table state) and HandContext (per-hand state)
 * - Coordinates multiple service layers for specialized functionality
 * - Serializes all mutations through an action queue for consistency
 * - Provides public API for client binding, player lifecycle, and actions
 *
 * Key Responsibilities:
 * =====================
 * 1. Client Management: Bind/unbind clients, manage connection state
 * 2. Player Lifecycle: Join/leave/rebuy/bot management with persistence
 * 3. Hand Execution: Start → betting rounds → showdown → settlement
 * 4. Action Processing: Queue, deduplicate, and execute player actions
 * 5. State Persistence: Hand history, player stats, and ledger management
 * 6. Automation: Bot actions and disconnected player handling
 *
 * Service Layer Integration:
 * =========================
 * - ActionService: Action validation and execution
 * - SettlementService: Pot distribution and chip management
 * - HandLifecycleService: Hand progression and state transitions
 * - TurnAutomationService: Bot and disconnected player automation
 * - PlayerLifecycleService: Player state management
 * - SnapshotService: State synchronization to clients
 *
 * Thread Safety:
 * =============
 * All state mutations are serialized through the action queue to prevent
 * race conditions and ensure consistent state transitions.
 *
 * @author Poker Champ Team
 * @since 1.0.0
 * @version 2.0.0
 */

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
import { type TableLastAction, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { BotResolver } from "./bots/BotResolver.js";
import { SnapshotService, type SnapshotReason } from "./dealer/services/SnapshotService.js";
import { ActionService, type ActionResult, type ActionServiceLastAction, type ActionDebitKind } from "./dealer/services/ActionService.js";
import { SettlementService } from "./dealer/services/SettlementService.js";
import { HandLifecycleService, type HandLifecyclePlan } from "./dealer/services/HandLifecycleService.js";
import { TurnAutomationService } from "./dealer/services/TurnAutomationService.js";
import { PlayerLifecycleService, type PlayerLifecyclePlan } from "./dealer/services/PlayerLifecycleService.js";
import { ActionOptionsService } from "./dealer/services/ActionOptionsService.js";
import { SessionPlayerStatsTracker } from "./dealer/services/SessionPlayerStatsTracker.js";
import type { FrameReason } from "./replay/FrameReason.js";
import {
  countNonOutPlayers,
  countNotFoldedPlayers,
  findNextToActSeat,
} from "./dealer/utils/TableNavigator.js";
import { buildActionKey, buildClaimKey } from "./dealer/utils/actionKeys.js";
import { buildHandHistoryRoster } from "./dealer/utils/handHistoryRoster.js";
import { HandContext } from "./dealer/HandContext.js";
import { NEXT_HAND_DELAY_MS } from "./dealer/timing.js";
import { maybeAssertBettingState } from "./invariants/assertBettingState.js";
/**
 * Dealer: table state machine and action gateway.
 *
 * - Owns PokerState, HandContext (per-hand), and service wiring.
 * - Public API: client binding, player lifecycle (join/leave/rebuy/bots), connection state, handleAction.
 * - Hand lifecycle: startHand → advanceStreetOrShowdown / finishHand* → transitionToWaiting → scheduleNextHand.
 * - All mutation is serialized through the action queue (or enqueueSerializedStateMutation for non-action paths).
 */
/**
 * ============================================================================
 * DEALER CLASS - MAIN IMPLEMENTATION
 * ============================================================================
 */

export class Dealer {
  // ---------------------------------------------------------------------------
  // CORE STATE & SERVICE DEPENDENCIES
  // ---------------------------------------------------------------------------
  // Persistent table state and service infrastructure

  private readonly state: PokerState;
  private readonly persistence: PersistenceFacade;
  private readonly clientsByUserId: Map<string, Client> = new Map();

  private pendingSeatReleaseUserIds: Set<string> = new Set();
  /** Displayed after hand ends during WAITING; set by HandLifecycleService callback. */
  private lastHandResult: TableSnapshotPayload["lastHandResult"] | undefined = undefined;
  private readonly botResolver = new BotResolver();
  private readonly autoActionsByUserId: Map<string, number> = new Map();
  private readonly currentHandAutoActedUserIds: Set<string> = new Set();
  private readonly onAutoSitOutReachedCap?: (args: { userId: string; stackCents: number }) => Promise<void> | void;
  private readonly snapshotService: SnapshotService;
  private readonly actionService: ActionService;
  private readonly settlementService: SettlementService;
  private readonly handLifecycleService: HandLifecycleService;
  private readonly turnAutomationService: TurnAutomationService;
  private readonly playerLifecycleService: PlayerLifecycleService;
  private readonly actionOptionsService = new ActionOptionsService();
  private readonly sessionStatsTracker = new SessionPlayerStatsTracker();

  /** One hand. Created at HAND_START, cleared when transitioning to WAITING. */
  private currentHand: HandContext | null = null;

  private actionQueue: Promise<void> = Promise.resolve();
  private pendingActionCount = 0;
  private readonly maxQueueDepth: number;
  private disconnectSweepIntervalId: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // CONSTRUCTOR - SERVICE WIRING & INITIALIZATION
  // ---------------------------------------------------------------------------
  // Initializes all service layers with proper dependency injection

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
      maxQueueDepth?: number;
    },
  ) {
    this.state = state;
    this.persistence =
      persistence ??
      new PersistenceFacade({
        tableId: this.state.tableId || "table_poc",
        tableName: this.state.tableName,
      });
    this.onAutoSitOutReachedCap = options?.onAutoSitOutReachedCap;
    this.maxQueueDepth = options?.maxQueueDepth ?? 50;
    // Hand-scoped getters: return currentHand's maps when a hand is active, else empty. Write paths (e.g. deal
    // in HandLifecycleService) only run when currentHand was just set (startHand) or during an active hand.
    this.settlementService = new SettlementService({
      state: this.state,
      persistence: this.persistence,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      getHandStartingStacksByPlayerId: () => this.currentHand?.handStartingStacksByPlayerId ?? new Map(),
    });
    this.handLifecycleService = new HandLifecycleService({
      state: this.state,
      persistence: this.persistence,
      settlementService: this.settlementService,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      getHandStartingStacksByPlayerId: () => this.currentHand?.handStartingStacksByPlayerId ?? new Map(),
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      getProcessedActionIds: () => this.currentHand?.processedActionKeys ?? new Set(),
      applyDisconnectedAutoActionCapForHand: () => this.applyDisconnectedAutoActionCapForHand(),
      setLastHandResult: (value) => { this.lastHandResult = value; },
      setLastAction: (value) => { if (this.currentHand) this.currentHand.lastAction = value; },
    });
    this.turnAutomationService = new TurnAutomationService({
      state: this.state,
      botResolver: this.botResolver,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
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
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      ensurePlayerPersistence: (player) => this.ensurePlayerPersistence(player),
      forceFoldIfInHand: (userId) => this.forceFoldForLeave(userId),
    });
    this.snapshotService = new SnapshotService({
      state: this.state,
      clientsByUserId: this.clientsByUserId,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      getLastHandResult: () => this.lastHandResult,
      getLastAction: () => this.currentHand?.lastAction,
      getHeroSessionStats: (userId) => this.sessionStatsTracker.get(userId),
      emitHook: options?.onTableSnapshotEmitted,
    });
    this.actionService = new ActionService({
      state: this.state,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      getLastAction: () => this.currentHand?.lastAction,
    });
    this.startDisconnectSweep();
    if (this.state.seats.length === 0) {
      for (let i = 0; i < (this.state.maxSeats || 9); i++) this.state.seats.push("");
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API - CLIENT BINDING & SNAPSHOT MANAGEMENT
  // ---------------------------------------------------------------------------
  // Client connection management and state synchronization

  bindClient(userId: string, client: Client) { this.clientsByUserId.set(userId, client); }
  unbindClient(userId: string) { this.clientsByUserId.delete(userId); }
  getClient(userId: string) { return this.clientsByUserId.get(userId); }
  hasPlayer(userId: string) { return this.state.playersById.has(userId); }

  /** Session-scoped stats: clear on room dispose to avoid long-lived accumulation. */
  resetSessionStats(): void {
    this.sessionStatsTracker.resetAll();
  }
  emitSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToUser(userId, reason, actionId);
  }
  emitSnapshotsToAll(reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToAll(reason, actionId);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API - PLAYER LIFECYCLE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Player join/leave/rebuy operations and bot management

  async addPlayer(userId: string, name: string, buyInCents: number) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.addPlayerInternal(userId, name, buyInCents);
    });
  }

  async restorePlayerFromSession(
    userId: string,
    name: string,
    seat: number,
    stackCents: number,
    options?: { connected?: boolean; sittingOut?: boolean },
  ) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.restorePlayerFromSessionInternal(userId, name, seat, stackCents, options);
    });
  }

  /** Serialized with applyRebuy so add-bot-after-rebuy sees updated state/ledger. */
  async addBot(botId: string, name: string, buyInCents: number, catalogBotId?: string) {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addBot(botId, name, buyInCents, catalogBotId);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async removeBot(botId: string) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.removeBotInternal(botId);
    });
  }

  async removePlayer(userId: string, options?: { cashOutAfterRemoval?: boolean }) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.removePlayerInternal(userId, options);
    });
  }

  /** Add chips to seated player (rebuy). Ledger must already be updated via economy buy-in. */
  async applyRebuy(userId: string, amountCents: number, rebuyRef?: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addChipsToSeatedPlayer(userId, amountCents, rebuyRef);
      await this.executePlayerLifecyclePlans(plans);
    });
  }

  async handleConsentedLeave(userId: string) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.forceFoldForLeave(userId);
      await this.removePlayerInternal(userId, { cashOutAfterRemoval: true });
    });
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API - CONNECTION STATE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Handle player disconnects, reconnects, abandons, and kicks

  markDisconnected(userId: string, disconnectDeadlineTs: number) {
    void this.markDisconnectedSerialized(userId, disconnectDeadlineTs).catch((err) => {
      logger.error({ err, userId }, "markDisconnected failed");
    });
  }

  markReconnected(userId: string) {
    void this.markReconnectedSerialized(userId).catch((err) => {
      logger.error({ err, userId }, "markReconnected failed");
    });
  }

  async markAbandoned(userId: string) {
    await this.markAbandonedSerialized(userId);
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
      await this.markAbandonedInternal(userId);
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

  // ---------------------------------------------------------------------------
  // PUBLIC API - PLAYER ACTION PROCESSING
  // ---------------------------------------------------------------------------
  // Action queuing, deduplication, and execution pipeline

  async handleAction(userId: string, msg: ActionPayload, actionId?: string) {
    if (this.pendingActionCount >= this.maxQueueDepth) {
      throw new PokerError("QUEUE_FULL", "Action queue full. Retry shortly.", {
        retryAfterSeconds: 2,
        queueDepth: this.pendingActionCount,
        maxQueueDepth: this.maxQueueDepth,
      });
    }
    this.pendingActionCount++;
    const currentHandIdAtEnqueue = this.state.handId ?? null;
    const queued = this.actionQueue
      .catch((err) => {
        if (!this.isSkippableQueuedActionError(err)) {
          logger.warn({ err }, "Recovering dealer queue after prior failure before player action");
        }
      })
      .then(async () => {
        try {
          // handContext is read at run time (this.currentHand); currentHandIdAtEnqueue is from enqueue time.
          // If the hand changed in between, sameHand is false and we skip dedup (correct — no record in wrong hand).
          const handContext = this.currentHand;
          const sameHand = handContext && currentHandIdAtEnqueue && this.state.handId === currentHandIdAtEnqueue;
          const actionKey =
            actionId && currentHandIdAtEnqueue ? buildActionKey(currentHandIdAtEnqueue, userId, actionId) : null;
          const claimKey =
            actionId && currentHandIdAtEnqueue ? buildClaimKey(currentHandIdAtEnqueue, actionId) : null;
          if (sameHand && claimKey) {
            if (handContext!.recordClaimAndWarnIfCollision(claimKey, userId)) {
              logger.warn(
                { handId: currentHandIdAtEnqueue, actionId, firstUserId: handContext!.actionIdFirstClaimByKey.get(claimKey), userId },
                "ACTION_ID_CROSS_USER_COLLISION",
              );
            }
          }
          if (sameHand && actionKey && handContext!.isDuplicate(actionKey)) return;
          const handIdBefore = this.state.handId;
          try {
            await this._handleAction(userId, msg, "PLAYER");
            if (handContext && actionKey && handIdBefore && this.state.handId === handIdBefore) {
              handContext.recordProcessed(actionKey);
            }
          } catch (err) {
            if (err instanceof PokerError) {
              logger.warn({ err, userId, action: msg.action, code: err.code }, "Action rejected");
            } else {
              logger.error({ err, userId, action: msg.action }, "Action failed");
            }
            throw err;
          }
        } finally {
          this.pendingActionCount--;
        }
      });
    this.actionQueue = queued;
    return queued;
  }

  // ---------------------------------------------------------------------------
  // ACTION HANDLING - PRIVATE IMPLEMENTATION
  // ---------------------------------------------------------------------------
  // Core action execution, result application, and preflop statistics

  private async _handleAction(userId: string, msg: ActionPayload, origin: TableLastAction["origin"]) {
    const roundBetBefore = this.state.street === "PREFLOP" ? this.state.roundCurrentBetCents : 0;
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
    if (this.state.street === "PREFLOP" && execution.lastAction) {
      this.updatePreflopFlagsAfterAction(userId, execution.lastAction, roundBetBefore);
    }
    await this.applyActionResult(execution.result, {
      turnAdvancedReason: execution.result.kind === "TURN_ADVANCED" && execution.result.actorKind === "BOT"
        ? "BOT_ACTION"
        : "ACTION_ACCEPTED",
    });
  }

  private setLastActionFromExecution(lastAction: ActionServiceLastAction | undefined): void {
    if (!lastAction || !this.currentHand) return;
    const nextSeq = this.state.handActionSeq + 1;
    this.state.handActionSeq = nextSeq;
    this.currentHand.lastAction = {
      ...lastAction,
      seq: nextSeq,
    };
  }

  /** Call at HAND_START after hand is started so dealt-in players have flags. */
  private initPreflopFlagsForHand(): void {
    if (!this.currentHand) return;
    this.currentHand.initPreflopFlags(this.currentHand.holeCardsByPlayerId.keys());
  }

  /** Apply-time only: roundBetBefore must be captured before execution. */
  private updatePreflopFlagsAfterAction(
    userId: string,
    lastAction: ActionServiceLastAction,
    roundBetBefore: number,
  ): void {
    if (!this.currentHand) return;
    this.currentHand.recordActionForPreflopStats(
      userId,
      lastAction,
      roundBetBefore,
      (id) => this.state.playersById.get(id)?.roundBetCents ?? 0,
    );
  }

  /** Call before emitting HAND_END snapshot so payload includes updated stats. */
  private flushSessionStatsOnly(): void {
    this.currentHand?.flushPreflopFlagsToSessionStats(this.sessionStatsTracker);
  }

  /** Stats flush is done by flushSessionStatsOnly() before HAND_END snapshot; this only transitions and clears context. */
  private transitionToWaiting(): void {
    this.state.street = "WAITING";
    this.state.runoutMode = "NONE";
    this.currentHand = null;
  }

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Hand initiation, street progression, and completion scenarios

  private async startHand() {
    this.currentHand = new HandContext();
    try {
      const plans = await this.handLifecycleService.startHand();
      if (this.state.street === "WAITING") {
        this.currentHand = null;
        return;
      }
      this.initPreflopFlagsForHand();
      await this.executeHandLifecyclePlans(plans);
    } catch (err) {
      this.currentHand = null;
      throw err;
    }
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

  // ---------------------------------------------------------------------------
  // PLAN EXECUTION ENGINE
  // ---------------------------------------------------------------------------
  // Execute lifecycle plans from various service layers

  private async executeHandLifecyclePlans(plans: HandLifecyclePlan[]): Promise<void> {
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          // IMPORTANT: flush stats BEFORE emitting HAND_END snapshot so payload includes updated hero.playerStats.
          if (plan.reason === "HAND_END") this.flushSessionStatsOnly();
          this.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "DELAY":
          await new Promise((resolve) => setTimeout(resolve, plan.ms));
          break;
        case "MAYBE_AUTOMATE_TURN":
          this.maybeActForBot();
          break;
        case "TRANSITION_TO_WAITING":
          this.transitionToWaiting();
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

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE HELPER METHODS
  // ---------------------------------------------------------------------------
  // Support functions for hand progression, seat management, and player removal

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
          this.enqueueSerializedStateMutation(() => this.startHand()).catch((err) => {
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
      await this.removePlayerInternal(userId);
    }
  }

  private async addPlayerInternal(userId: string, name: string, buyInCents: number): Promise<void> {
    const plans = await this.playerLifecycleService.addPlayer(userId, name, buyInCents);
    await this.executePlayerLifecyclePlans(plans);
  }

  private async restorePlayerFromSessionInternal(
    userId: string,
    name: string,
    seat: number,
    stackCents: number,
    options?: { connected?: boolean; sittingOut?: boolean },
  ): Promise<void> {
    const plans = await this.playerLifecycleService.restorePlayerFromSession(userId, name, seat, stackCents, options);
    await this.executePlayerLifecyclePlans(plans);
  }

  private async removeBotInternal(botId: string): Promise<void> {
    const plans = await this.playerLifecycleService.removeBot(botId);
    await this.executePlayerLifecyclePlans(plans);
  }

  private async removePlayerInternal(
    userId: string,
    options?: { cashOutAfterRemoval?: boolean },
  ): Promise<void> {
    const plans = await this.playerLifecycleService.removePlayer(userId, options);
    await this.executePlayerLifecyclePlans(plans);
  }

  private async markAbandonedInternal(userId: string): Promise<void> {
    const plans = await this.playerLifecycleService.markAbandoned(userId);
    await this.executePlayerLifecyclePlans(plans);
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
        this.sendTableSnapshotToAll(options?.turnAdvancedReason ?? "ACTION_ACCEPTED", `act_${this.state.handId}_${this.state.handActionSeq}`);
        maybeAssertBettingState(this.state);
        this.maybeActForBot();
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // PERSISTENCE LAYER INTEGRATION
  // ---------------------------------------------------------------------------
  // Hand history, player data, and table state persistence

  private async ensurePlayerPersistence(p: PlayerState) {
    if (!this.persistence.enabled || !this.persistence.handHistory || !this.persistence.ledger) return;
    try {
      const roster = buildHandHistoryRoster(this.state.playersById);
      await this.persistence.handHistory.ensureTableAndPlayers(roster);
      await this.persistence.ledger.ensureBalances([p.id], { [p.id]: 0 });
    } catch (err) {
      logger.warn({ err, userId: p.id }, "player persistence ensure failed; continuing in-memory");
    }
  }

  // ---------------------------------------------------------------------------
  // ACTION QUEUE & AUTOMATION SYSTEM
  // ---------------------------------------------------------------------------
  // Bot automation, internal actions, and serialized state mutations

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
        if (!this.isSkippableQueuedActionError(err)) {
          logger.warn({ err }, "Recovering dealer queue after prior failure");
        }
      })
      .then(work);
    this.actionQueue = queued;
    return queued;
  }

  // ---------------------------------------------------------------------------
  // DISCONNECT DEADLINE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Periodic cleanup of abandoned players and deadline enforcement

  private static readonly DISCONNECT_SWEEP_MS = 10_000;

  private startDisconnectSweep(): void {
    if (this.disconnectSweepIntervalId != null) return;
    this.disconnectSweepIntervalId = setInterval(() => {
      void this.enqueueSerializedStateMutation(() => this.sweepDisconnectDeadlines());
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
      if (player.disconnectDeadlineTs <= 0 || now <= player.disconnectDeadlineTs) continue;
      // TODO (DEALER_REFACTOR_PROPOSAL): Clear disconnectDeadlineTs to 0 in the reconnect path so a connected
      // player never has a past deadline; then this branch is unreachable and can be removed.
      if (this.clientsByUserId.has(userId)) {
        const plans = this.playerLifecycleService.markReconnected(userId);
        await this.executePlayerLifecyclePlans(plans);
        continue;
      }
      toAbandon.push(userId);
    }
    for (const userId of toAbandon) {
      try {
        await this.markAbandoned(userId);
      } catch (err) {
        logger.warn({ err, userId }, "disconnect sweep markAbandoned failed");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SNAPSHOT DELEGATION - INTERNAL USE
  // ---------------------------------------------------------------------------
  // Internal snapshot emission (public API available for single-user emits)

  private sendTableSnapshotToAll(reason: SnapshotReason, actionId?: string) {
    this.snapshotService.emitToAll(reason, actionId);
  }

}
