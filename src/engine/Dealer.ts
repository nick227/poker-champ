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
import { BOT_ACTION_DELAY_MIN_MS, BOT_ACTION_DELAY_MAX_MS } from "./dealer/timing.js";
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

export type DealerDiagnosticType =
  | "QUEUE_RECOVERY_AFTER_FAILURE"
  | "ACTION_REJECTED"
  | "ACTION_FAILED"
  | "LIFECYCLE_DEFERRED_REMOVAL"
  | "STALL_NO_ELIGIBLE_ACTOR"
  | "QUEUED_AUTO_ACTION_STALE_DISCARDED"
  | "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED"
  | "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED"
  | "QUEUED_AUTO_ACTION_FAILED";

export type DealerDiagnosticEvent = {
  level: "warn" | "error";
  type: DealerDiagnosticType;
  message: string;
  code?: string;
  context?: Record<string, unknown>;
};

type QueuedTurnToken = {
  handId: string;
  street: PokerState["street"];
  handActionSeq: number;
  toActSeat: number;
  toActUserId: string;
  actorSeat: number;
};
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
  private diagnosticListeners: Set<(event: DealerDiagnosticEvent) => void> = new Set();

  addDiagnosticListener(
    listener: (event: DealerDiagnosticEvent) => void,
  ): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  private emitDiagnostic(event: DealerDiagnosticEvent): void {
    for (const listener of this.diagnosticListeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  private buildDiagnosticContext(context?: Record<string, unknown>): Record<string, unknown> {
    return {
      handId: this.state.handId ?? null,
      street: this.state.street,
      toActSeat: this.state.toActSeat,
      handActionSeq: this.state.handActionSeq,
      ...context,
    };
  }

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
  private disposed = false;
  private readonly onHandEndedAwards?: (
    handSummary: {
      handId: string;
      reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK";
      potCents: number;
      bigBlindCents: number;
      payoutsByUserId: Record<string, number>;
      winnerId?: string;
      allInPlayerIds: string[];
    },
    dealtUserIds: string[],
    getSessionState: (userId: string) => { sessionId: string; sessionHands: number; consecutiveWins: number }
  ) => Promise<void>;

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
      getAvatarByUserId?: (userId: string) => Promise<{ avatarUrl: string | null; avatarVersion: number | null }>;
      maxQueueDepth?: number;
      onHandEndedAwards?: (
        handSummary: {
          handId: string;
          reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK";
          potCents: number;
          bigBlindCents: number;
          payoutsByUserId: Record<string, number>;
          winnerId?: string;
          allInPlayerIds: string[];
        },
        dealtUserIds: string[],
        getSessionState: (userId: string) => { sessionId: string; sessionHands: number; consecutiveWins: number }
      ) => Promise<void>;
    },
  ) {
    this.state = state;
    this.onHandEndedAwards = options?.onHandEndedAwards;
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
      getBotDelayMs: () => {
        const override = Number(process.env.POKER_BOT_DELAY_MS);
        if (Number.isFinite(override) && override >= 0) return Math.floor(override);
        // Production bot \"thinking\" delay: random in [BOT_ACTION_DELAY_MIN_MS, BOT_ACTION_DELAY_MAX_MS].
        const min = BOT_ACTION_DELAY_MIN_MS;
        const max = BOT_ACTION_DELAY_MAX_MS;
        if (max <= min) return min;
        const span = max - min + 1;
        return min + Math.floor(Math.random() * span);
      },
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
      getAvatarByUserId: options?.getAvatarByUserId,
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
  emitSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string): Promise<void> {
    return this.snapshotService.emitToUser(userId, reason, actionId);
  }
  emitSnapshotsToAll(reason: SnapshotReason, actionId?: string): Promise<void> {
    return this.snapshotService.emitToAll(reason, actionId);
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
      await this.removePlayerInternal(userId, { cashOutAfterRemoval: true });
    });
  }

  async setPlayerSittingOut(userId: string, sittingOut: boolean): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      await this.setPlayerSittingOutInternal(userId, sittingOut);
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

  /**
   * Test-only hook to advance WAITING -> next hand using the normal start-hand pathway.
   * Guarded so production callers cannot trigger it.
   */
  async forceAdvanceToNextHandForTest(): Promise<void> {
    const enabled = process.env.NODE_ENV === "test" || process.env.ENABLE_DEALER_TEST_HOOKS === "1";
    if (!enabled) {
      throw new Error("forceAdvanceToNextHandForTest is disabled outside test mode");
    }
    await this.enqueueSerializedStateMutation(async () => {
      if (this.state.street !== "WAITING") {
        throw new Error(`forceAdvanceToNextHandForTest requires terminal hand state (street=WAITING, got=${this.state.street})`);
      }
      this.nextHandScheduled = false;
      this.state.nextHandAtTs = 0;
      await this.startHand();
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
          this.emitDiagnostic({
            level: "warn",
            type: "QUEUE_RECOVERY_AFTER_FAILURE",
            message: "Recovering dealer queue after prior failure before player action",
            context: this.buildDiagnosticContext(),
          });
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
              this.emitDiagnostic({
                level: "warn",
                type: "ACTION_REJECTED",
                message: "Action rejected",
                code: err.code,
                context: this.buildDiagnosticContext({ userId, action: msg.action }),
              });
            } else {
              logger.error({ err, userId, action: msg.action }, "Action failed");
              this.emitDiagnostic({
                level: "error",
                type: "ACTION_FAILED",
                message: "Action failed",
                context: this.buildDiagnosticContext({ userId, action: msg.action }),
              });
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
          await this.sendTableSnapshotToAll(plan.reason, plan.actionId);
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
        case "HAND_ENDED":
          await this.runHandEndedAwards(plan);
          break;
      }
    }
  }

  private async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[]): Promise<void> {
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          await this.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "LIFECYCLE_DEFERRED_REMOVAL":
          this.emitDiagnostic({
            level: "warn",
            type: "LIFECYCLE_DEFERRED_REMOVAL",
            message: "Lifecycle removal deferred until safe boundary",
            context: this.buildDiagnosticContext({ userId: plan.userId, reason: plan.reason }),
          });
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

  private async runHandEndedAwards(
    plan: Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>
  ): Promise<void> {
    const result = this.lastHandResult;
    if (!result || !this.currentHand) return;
    const dealtUserIds = [...this.currentHand.holeCardsByPlayerId.keys()].filter(
      (id) => this.state.playersById.get(id)?.kind === "HUMAN"
    );
    if (dealtUserIds.length === 0 || !this.onHandEndedAwards) return;
    const allInPlayerIds = [...this.state.playersById.values()]
      .filter((p) => p.status === "ALL_IN")
      .map((p) => p.id);
    const handSummary = {
      handId: result.handId,
      reason: plan.reason,
      potCents: plan.outcome.potCents,
      bigBlindCents: this.state.bigBlindCents,
      payoutsByUserId: plan.outcome.payoutsByUserId,
      winnerId: plan.outcome.winnerId,
      allInPlayerIds,
    };
    for (const userId of dealtUserIds) {
      const won = (plan.outcome.payoutsByUserId[userId] ?? 0) > 0;
      this.sessionStatsTracker.recordHandResult(userId, won);
    }
    const tableId = this.state.tableId || "table_poc";
    await this.onHandEndedAwards(handSummary, dealtUserIds, (userId) => ({
      sessionId: this.sessionStatsTracker.getSessionId(userId) || tableId,
      sessionHands: this.sessionStatsTracker.getSessionHands(userId),
      consecutiveWins: this.sessionStatsTracker.getConsecutiveWins(userId),
    }));
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

    setTimeout(async () => {
      this.state.nextHandAtTs = Date.now() + countdownMs;
      // Emit snapshot so clients see the countdown after result-hold window.
      await this.sendTableSnapshotToAll("AUTO_TRANSITION");

      setTimeout(async () => {
        if (this.disposed) return;

        this.state.nextHandAtTs = 0;

        const seated = [...this.state.playersById.values()]
          .filter(p => p.seat >= 0 && p.status !== "OUT");

        if (this.state.street === "WAITING" && seated.length >= 2) {
          this.enqueueSerializedStateMutation(() => {
            this.nextHandScheduled = false;
            return this.startHand();
          }).catch((err) => {
            this.nextHandScheduled = false;
            logger.error({ err, reason }, "Failed to auto-start next hand");
          });
        } else {
          // If we still cannot start (e.g. players left), ensure clients know we are WAITING
          this.nextHandScheduled = false;
          await this.sendTableSnapshotToAll("AUTO_TRANSITION");
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

  private async setPlayerSittingOutInternal(userId: string, sittingOut: boolean): Promise<void> {
    const player = this.state.playersById.get(userId);
    if (!player || player.kind !== "HUMAN") return;

    if (sittingOut) {
      player.sittingOutUntilNextHand = true;
      player.disconnectDeadlineTs = 0;
      player.needsAction = false;

      if (player.stackCents <= 0) {
        player.status = "OUT";
        await this.sendTableSnapshotToAll("SEAT_CHANGE");
        return;
      }

      if (player.status !== "OUT") {
        player.status = "ABANDONED";
      }

      await this.sendTableSnapshotToAll("SEAT_CHANGE");

      if (this.state.street === "WAITING") return;

      if (countNotFoldedPlayers(this.state) <= 1) {
        await this.finishHandByLastStanding();
        return;
      }

      if (this.state.toActSeat === player.seat) {
        if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
          await this.advanceStreetOrShowdown();
          return;
        }
        const nextSeat = findNextToActSeat(this.state, player.seat);
        if (nextSeat === -1) {
          await this.advanceStreetOrShowdown();
          return;
        }
        this.state.toActSeat = nextSeat;
      }

      this.maybeActForBot();
      return;
    }

    player.sittingOutUntilNextHand = false;
    player.disconnectDeadlineTs = 0;
    player.needsAction = false;

    if (player.stackCents <= 0) {
      player.status = "OUT";
      await this.sendTableSnapshotToAll("SEAT_CHANGE");
      return;
    }

    if (this.state.street === "WAITING") {
      player.status = "ACTIVE";
      await this.sendTableSnapshotToAll("SEAT_CHANGE");
      if (countNonOutPlayers(this.state) >= 2) {
        await this.startHand();
      }
      return;
    }

    // During an active hand, rejoin means "eligible for the next hand".
    if (player.status === "OUT") {
      player.status = "ABANDONED";
    }
    await this.sendTableSnapshotToAll("SEAT_CHANGE");
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
        await this.sendTableSnapshotToAll("AUTO_TRANSITION");
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
        await this.sendTableSnapshotToAll(options?.turnAdvancedReason ?? "ACTION_ACCEPTED", `act_${this.state.handId}_${this.state.handActionSeq}`);
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
    const turnToken = this.captureTurnToken(userId);
    this.actionQueue = this.actionQueue.then(async () => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const staleReason = this.getQueuedTurnTokenStaleReason(turnToken);
      if (staleReason) {
        this.emitDiagnostic({
          level: "warn",
          type: "QUEUED_AUTO_ACTION_STALE_DISCARDED",
          message: "Queued auto-action discarded due to stale turn token",
          context: this.buildDiagnosticContext({
            userId,
            action: payload.action,
            staleReason,
            token: turnToken ?? null,
          }),
        });
        return;
      }

      // Skip auto-action if a human reconnected in the meantime
      const p = this.state.playersById.get(userId);
      if (p && p.kind !== "BOT" && p.connected) {
        logger.info({ userId, action: payload.action }, "Skipping queued auto-action; player reconnected");
        this.emitDiagnostic({
          level: "warn",
          type: "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED",
          message: "Queued auto-action skipped because player reconnected",
          context: this.buildDiagnosticContext({ userId, action: payload.action }),
        });
        return;
      }

      const eligibilityError = this.getQueuedAutoActionIneligibleReason(userId);
      if (eligibilityError) {
        this.emitDiagnostic({
          level: "warn",
          type: "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED",
          message: "Queued auto-action discarded because actor is ineligible",
          context: this.buildDiagnosticContext({
            userId,
            action: payload.action,
            reason: eligibilityError,
          }),
        });
        return;
      }

      const normalized = this.normalizeQueuedAutoAction(userId, payload);
      if (!normalized) {
        this.emitDiagnostic({
          level: "warn",
          type: "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED",
          message: "Queued auto-action discarded because no legal action options were available",
          context: this.buildDiagnosticContext({ userId, action: payload.action }),
        });
        return;
      }
      await this._handleAction(userId, normalized, "AUTO");
    }).catch((err) => {
      if (this.isSkippableQueuedActionError(err)) {
        logger.warn(
          { err, userId, action: payload.action, street: this.state.street },
          "Queued auto-action skipped after state changed",
        );
        const code = err instanceof PokerError ? err.code : undefined;
        this.emitDiagnostic({
          level: "warn",
          type: "QUEUED_AUTO_ACTION_STALE_DISCARDED",
          message: "Queued auto-action skipped after state changed",
          code,
          context: this.buildDiagnosticContext({ userId, action: payload.action }),
        });
        return;
      }
      logger.error({ err, userId, action: payload.action }, "Queued auto-action failed");
      const code = err instanceof PokerError ? err.code : undefined;
      this.emitDiagnostic({
        level: "error",
        type: "QUEUED_AUTO_ACTION_FAILED",
        message: "Queued auto-action failed",
        code,
        context: this.buildDiagnosticContext({ userId, action: payload.action }),
      });
    });
  }

  private captureTurnToken(userId: string): QueuedTurnToken | null {
    const handId = this.state.handId;
    const toActSeat = this.state.toActSeat;
    const toActUserId = this.state.seats[toActSeat];
    const actor = this.state.playersById.get(userId);
    if (!handId || !toActUserId || !actor) return null;
    return {
      handId,
      street: this.state.street,
      handActionSeq: this.state.handActionSeq,
      toActSeat,
      toActUserId,
      actorSeat: actor.seat,
    };
  }

  private getQueuedTurnTokenStaleReason(token: QueuedTurnToken | null): string | null {
    if (!token) return "MISSING_ENQUEUE_TURN_TOKEN";
    if (this.state.handId !== token.handId) return "HAND_ID_CHANGED";
    if (this.state.street !== token.street) return "STREET_CHANGED";
    if (this.state.handActionSeq !== token.handActionSeq) return "HAND_ACTION_SEQ_CHANGED";
    if (this.state.toActSeat !== token.toActSeat) return "TO_ACT_SEAT_CHANGED";
    const currentToActUserId = this.state.seats[this.state.toActSeat] ?? "";
    if (currentToActUserId !== token.toActUserId) return "TO_ACT_USER_CHANGED";
    return null;
  }

  private getQueuedAutoActionIneligibleReason(userId: string): string | null {
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") {
      return `STREET_NOT_ACTIONABLE:${this.state.street}`;
    }
    if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
      return "BETTING_ROUND_CLOSED";
    }
    const player = this.state.playersById.get(userId);
    if (!player) return "PLAYER_NOT_FOUND";
    if (player.status !== "ACTIVE") return `PLAYER_NOT_ACTIVE:${player.status}`;
    if (!player.needsAction) return "PLAYER_DOES_NOT_NEED_ACTION";
    if (player.seat !== this.state.toActSeat) return `PLAYER_NOT_TO_ACT:seat=${player.seat};toAct=${this.state.toActSeat}`;
    return null;
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
          this.emitDiagnostic({
            level: "warn",
            type: "QUEUE_RECOVERY_AFTER_FAILURE",
            message: "Recovering dealer queue after prior failure",
            context: this.buildDiagnosticContext(),
          });
        }
      })
      .then(() => {
        if (this.disposed) return;
        return work();
      });
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

  /** Call when room is being destroyed to prevent timeout callbacks on dead instances */
  dispose(): void {
    this.disposed = true;
    this.stopDisconnectSweep();
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
        // Note: markAbandoned calls enqueueSerializedStateMutation which chains onto this.actionQueue.
        // This works correctly because the new work runs after the current sweep completes.
        // Do not "simplify" this to a direct call or it could introduce a deadlock.
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

  private async sendTableSnapshotToAll(reason: SnapshotReason, actionId?: string): Promise<void> {
    await this.snapshotService.emitToAll(reason, actionId);
  }

  private normalizeQueuedAutoAction(userId: string, payload: ActionPayload): ActionPayload | null {
    const options = this.actionOptionsService.buildHeroActionOptions(this.state, userId);
    if (!options) return null;

    const normalizedRaiseAmount = (inputAmount: number | undefined): number => {
      const min = options.minRaiseTo ?? options.maxRaiseTo ?? 0;
      const max = options.maxRaiseTo ?? min;
      const proposed = inputAmount ?? min;
      return Math.max(min, Math.min(max, proposed));
    };

    const isLegal = (() => {
      switch (payload.action) {
        case "FOLD":
          return options.canFold;
        case "CHECK":
          return options.canCheck;
        case "CALL":
          return options.canCall;
        case "ALL_IN":
          return options.canAllIn;
        case "BET":
          return options.canBet;
        case "RAISE":
          return options.canRaise;
        default:
          return false;
      }
    })();

    if (isLegal) {
      if (payload.action === "BET" || payload.action === "RAISE") {
        return { action: payload.action, amountCents: normalizedRaiseAmount(payload.amountCents) };
      }
      return payload;
    }

    if (options.canCheck) return { action: "CHECK" };
    if (options.canCall) return { action: "CALL" };
    if (options.canFold) return { action: "FOLD" };
    if (options.canAllIn) return { action: "ALL_IN" };
    if (options.canBet) return { action: "BET", amountCents: normalizedRaiseAmount(undefined) };
    if (options.canRaise) return { action: "RAISE", amountCents: normalizedRaiseAmount(undefined) };
    return null;
  }

}
