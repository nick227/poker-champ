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
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import {
  allRemainingPlayersAllInOrFolded,
  bettingRoundComplete,
  eligibleToAct,
  noFurtherBettingPossible,
  syncRoundCurrentBetCents,
} from "./rules/BettingRound.js";
import { PokerError } from "./errors.js";
import { PersistenceFacade } from "./persistence/PersistenceFacade.js";
import { type TableLastAction, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { BotResolver } from "./bots/BotResolver.js";
import { SnapshotService, type SnapshotReason } from "./dealer/hand/SnapshotService.js";
import { ActionService, type ActionResult, type ActionServiceLastAction, type ActionDebitKind } from "./dealer/turn/ActionService.js";
import { SettlementService } from "./dealer/settlement/SettlementService.js";
import { HandLifecycleService, type HandLifecyclePlan } from "./dealer/hand/HandLifecycleService.js";
import { TurnAutomationService } from "./dealer/turn/TurnAutomationService.js";
import { BOT_ACTION_DELAY_MIN_MS, BOT_ACTION_DELAY_MAX_MS, TURN_TIMEOUT_TOTAL_MS } from "./dealer/timing.js";
import { PlayerLifecycleService, type PlayerLifecyclePlan } from "./dealer/hand/PlayerLifecycleService.js";
import { ActionOptionsService } from "./dealer/turn/ActionOptionsService.js";
import { SessionPlayerStatsTracker } from "./dealer/settlement/SessionPlayerStatsTracker.js";
import { TurnManager } from "./dealer/turn/TurnManager.js";
import { LifecycleExecutor } from "./dealer/hand/LifecycleExecutor.js";
import { HandOrchestrator } from "./dealer/hand/HandOrchestrator.js";
import { DisconnectManager } from "./dealer/hand/DisconnectManager.js";
import type { FrameReason } from "./replay/FrameReason.js";
import {
  countNonOutPlayers,
  countNotFoldedPlayers,
  findNextToActSeat,
} from "./dealer/utils/TableNavigator.js";
import { buildActionKey, buildClaimKey } from "./dealer/utils/actionKeys.js";
import { buildHandHistoryRoster } from "./dealer/utils/handHistoryRoster.js";
import { HandContext } from "./dealer/HandContext.js";
import { maybeAssertBettingState } from "./invariants/assertBettingState.js";
import { computeNextStep, getStallReason, projectDecisionState, type DecisionState, type StallReason } from "./dealer/decision/index.js";
import type { EngineQueries } from "./dealer/decision/engineQueries.js";
import { dealerRuntimeMetrics } from "./dealer/metrics/dealerRuntimeMetrics.js";

export type DealerDiagnosticType =
  | "QUEUE_FULL"
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

type HandEndedAwardsCallback = (
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

type DealerConstructorOptions = {
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
  onHandEndedAwards?: HandEndedAwardsCallback;
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
      } catch (err) {
        void err;
      }
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

  private emitLifecycleDeferredRemovalDiagnostic(userId: string, reason: string): void {
    this.emitDiagnostic({
      level: "warn",
      type: "LIFECYCLE_DEFERRED_REMOVAL",
      message: "Lifecycle removal deferred until safe boundary",
      context: this.buildDiagnosticContext({ userId, reason }),
    });
  }

  private getSessionStateForAwards(userId: string): { sessionId: string; sessionHands: number; consecutiveWins: number } {
    return {
      sessionId: this.sessionStatsTracker.getSessionId(userId) || (this.state.tableId || "table_poc"),
      sessionHands: this.sessionStatsTracker.getSessionHands(userId),
      consecutiveWins: this.sessionStatsTracker.getConsecutiveWins(userId),
    };
  }

  private getBotDelayMs(): number {
    const override = Number(process.env.POKER_BOT_DELAY_MS);
    if (Number.isFinite(override) && override >= 0) return Math.floor(override);
    // Production bot "thinking" delay: random in [BOT_ACTION_DELAY_MIN_MS, BOT_ACTION_DELAY_MAX_MS].
    const min = BOT_ACTION_DELAY_MIN_MS;
    const max = BOT_ACTION_DELAY_MAX_MS;
    if (max <= min) return min;
    const span = max - min + 1;
    return min + Math.floor(Math.random() * span);
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
  private readonly lifecycleExecutor: LifecycleExecutor;
  private readonly handOrchestrator: HandOrchestrator;
  private readonly disconnectManager: DisconnectManager;
  private readonly actionOptionsService = new ActionOptionsService();
  private readonly sessionStatsTracker = new SessionPlayerStatsTracker();
  private readonly engineDecisionSampleRate = Dealer.parseSampleRate(process.env.ENGINE_DECISION_SAMPLE_RATE, 0);
  private readonly engineDecisionTableIdFilter = (process.env.ENGINE_DECISION_TABLE_ID ?? "").trim();

  /** One hand. Created at HAND_START, cleared when transitioning to WAITING. */
  private currentHand: HandContext | null = null;

  private readonly turnManager: TurnManager;
  private disposed = false;
  private readonly onHandEndedAwards?: HandEndedAwardsCallback;

  private static parseSampleRate(raw: string | undefined, defaultValue: number): number {
    const parsed = Number(raw ?? "");
    if (!Number.isFinite(parsed)) return defaultValue;
    if (parsed <= 0) return 0;
    if (parsed >= 1) return 1;
    return parsed;
  }

  // Legacy test compatibility: older tests access dealer.holeCardsByPlayerId directly.
  // Keep this bridge so tests can seed showdown cards without reaching into HandContext.
  get holeCardsByPlayerId(): Map<string, string[]> {
    if (!this.currentHand) {
      this.currentHand = new HandContext();
    }
    return this.currentHand.holeCardsByPlayerId;
  }

  // ---------------------------------------------------------------------------
  // CONSTRUCTOR - SERVICE WIRING & INITIALIZATION
  // ---------------------------------------------------------------------------
  // Initializes all service layers with proper dependency injection

  constructor(
    state: PokerState,
    persistence?: PersistenceFacade,
    options?: DealerConstructorOptions,
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
    this.turnManager = new TurnManager({
      state: this.state,
      maxQueueDepth: options?.maxQueueDepth ?? 50,
      isDisposed: () => this.disposed,
      emitDiagnostic: (event) => this.emitDiagnostic(event),
      buildDiagnosticContext: (context) => this.buildDiagnosticContext(context),
      handleInternalAction: (userId, payload) => this._handleAction(userId, payload, "AUTO"),
      setPlayerSittingOutInternal: (userId, sittingOut) => this.setPlayerSittingOutInternal(userId, sittingOut),
      onAutoActionDiscarded: () => this.maybeActForBot(),
    });
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
      onWaitingForActionEntered: (reason) => this.onWaitingForActionEntered(reason),
    });
    this.handOrchestrator = new HandOrchestrator({
      state: this.state,
      handLifecycleService: this.handLifecycleService,
      clearPendingHumanTurnTimeout: () => this.clearPendingHumanTurnTimeout(),
      createHandContext: () => new HandContext(),
      setCurrentHand: (hand) => { this.currentHand = hand; },
      getCurrentHand: () => this.currentHand,
      initPreflopFlagsForHand: () => this.initPreflopFlagsForHand(),
      executeHandLifecyclePlans: (plans) => this.executeHandLifecyclePlans(plans),
      enqueueSerializedStateMutation: (work) => this.enqueueSerializedStateMutation(work),
      sendTableSnapshotToAll: (reason, actionId) => this.sendTableSnapshotToAll(reason, actionId),
      isDisposed: () => this.disposed,
      getLastHandResult: () => this.lastHandResult,
      getOnHandEndedAwards: () => this.onHandEndedAwards,
      getDealtHumanUserIds: () =>
        this.currentHand
          ? [...this.currentHand.holeCardsByPlayerId.keys()].filter((id) => this.state.playersById.get(id)?.kind === "HUMAN")
          : [],
      recordSessionHandResult: (userId, won) => this.sessionStatsTracker.recordHandResult(userId, won),
      getSessionState: (userId) => this.getSessionStateForAwards(userId),
    });
    this.turnAutomationService = new TurnAutomationService({
      state: this.state,
      botResolver: this.botResolver,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      autoActionsByUserId: this.autoActionsByUserId,
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      enqueueAction: (userId, payload, delayMs) => this.turnManager.enqueueInternalAction(userId, payload, delayMs),
      getBotDelayMs: () => this.getBotDelayMs(),
      scheduleHumanTurnTimeout: (userId) => this.scheduleHumanTurnTimeout(userId),
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
    this.disconnectManager = new DisconnectManager({
      state: this.state,
      enqueueSerializedStateMutation: (work) => this.enqueueSerializedStateMutation(work),
      hasClient: (userId) => this.clientsByUserId.has(userId),
      markReconnected: async (userId) => {
        const plans = this.playerLifecycleService.markReconnected(userId);
        await this.executePlayerLifecyclePlans(plans);
      },
      markAbandoned: (userId) => this.markAbandoned(userId),
    });
    this.lifecycleExecutor = new LifecycleExecutor({
      sendTableSnapshotToAll: (reason, actionId) => this.sendTableSnapshotToAll(reason, actionId),
      isDisposed: () => this.disposed,
      flushSessionStatsOnly: () => this.flushSessionStatsOnly(),
      maybeActForBot: async () => {
        this.maybeActForBot();
      },
      getLifecycleLogContext: () => ({
        tableId: this.state.tableId,
        handId: this.state.handId ?? "",
        street: this.state.street,
      }),
      transitionToWaiting: () => this.transitionToWaiting(),
      releasePendingSeats: () => this.releasePendingSeats(),
      scheduleNextHand: (reason, delayMs) => this.scheduleNextHand(reason, delayMs),
      runHandEndedAwards: (plan) => this.runHandEndedAwards(plan),
      onHandEndedAwardsFailed: (err) => {
        logger.error({ err, handId: this.state.handId }, "HAND_ENDED side effects failed; continuing hand transition");
      },
      onLifecycleDeferredRemoval: (plan) => this.emitLifecycleDeferredRemovalDiagnostic(plan.userId, plan.reason),
      startHand: () => this.startHand(),
      ensureHandAdvancingAfterPlayerRemoval: (removedSeat) => this.ensureHandAdvancingAfterPlayerRemoval(removedSeat),
      finishHandByLastStanding: () => this.finishHandByLastStanding(),
      advanceStreetOrShowdown: () => this.advanceStreetOrShowdown(),
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
  async emitSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      await this.snapshotService.emitToUser(userId, reason, actionId);
    });
  }
  emitSnapshotsToAll(reason: SnapshotReason, actionId?: string): Promise<void> {
    return this.snapshotService.emitToAll(reason, actionId);
  }
  // Legacy test compatibility shim: older tests call dealer.buildHeroActionOptions(userId).
  buildHeroActionOptions(userId: string) {
    return this.actionOptionsService.buildHeroActionOptions(this.state, userId);
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
    options?: { connected?: boolean; sittingOut?: boolean; reconnectTimeoutMs?: number },
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
      this.handOrchestrator.resetNextHandSchedule();
      this.state.nextHandAtTs = 0;
      await this.requestDrive("START_HAND:FORCE_ADVANCE_TEST");
    });
  }

  async kickUser(userId: string, reason: string) {
    void reason;
    const client = this.clientsByUserId.get(userId);
    if (client) {
      try {
        client.leave();
      } catch (err) {
        void err;
      }
    }
    await this.markAbandoned(userId);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API - PLAYER ACTION PROCESSING
  // ---------------------------------------------------------------------------
  // Action queuing, deduplication, and execution pipeline

  /** Set for the duration of a player action so post-action snapshot is sent to this client even if unbound during async build. */
  private pendingActorRef: { userId: string; client: Client } | null = null;
  private lastWaitingWithoutDeadlineRepairLogAt = 0;
  private lastWaitingWithoutDeadlineRepairKey = "";
  // Legacy test compatibility: some regression tests introspect queue state via (dealer as any).actionQueue.
  private get actionQueue(): Promise<void> {
    return this.turnManager.getActionQueue();
  }
  // Legacy test compatibility: some tests replace actionQueue after forced failures.
  private set actionQueue(queue: Promise<void>) {
    this.turnManager.setActionQueue(queue);
  }
  // Legacy test compatibility: regression tests enqueue internal actions directly.
  private enqueueInternalAction(userId: string, payload: ActionPayload, delayMs = 0): void {
    this.turnManager.enqueueInternalAction(userId, payload, delayMs);
  }
  // Legacy test compatibility: tests monkey-patch this method to disable timeout automation.
  private scheduleHumanTurnTimeout(userId: string): void {
    this.turnManager.scheduleHumanTurnTimeout(userId);
  }

  /**
   * Ensure an actionable connected human always has a running server-side turn timer.
   * This is called from the common next-actor resolution path so timer arming cannot
   * be skipped by a missed automation/redrive step.
   */
  private ensureHumanTurnTimerForCurrentActor(trigger: string): void {
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN" || this.state.runoutMode === "STAGED") {
      this.clearPendingHumanTurnTimeout();
      return;
    }
    if (this.state.toActSeat < 0) {
      this.clearPendingHumanTurnTimeout();
      return;
    }

    const toActUserId = this.state.seats[this.state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || !eligibleToAct(toActPlayer)) {
      this.clearPendingHumanTurnTimeout();
      return;
    }
    if (!toActPlayer.needsAction) {
      const actionableRound =
        !bettingRoundComplete(this.state) &&
        !noFurtherBettingPossible(this.state) &&
        this.state.runoutMode !== "STAGED";
      if (
        actionableRound &&
        this.state.roundState === "WAITING_FOR_ACTION" &&
        toActPlayer.kind === "HUMAN" &&
        toActPlayer.connected &&
        process.env.NODE_ENV !== "production"
      ) {
        throw new PokerError(
          "BAD_STATE",
          `WAITING actor does not require action: hand=${this.state.handId} seat=${this.state.toActSeat} street=${this.state.street}`,
        );
      }
      if (!actionableRound) {
        this.clearPendingHumanTurnTimeout();
        return;
      }
      logger.warn(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          toActSeat: this.state.toActSeat,
          userId: toActUserId,
          trigger,
        },
        "TO_ACT_NEEDS_ACTION_REPAIRED_BEFORE_TIMER_ARM",
      );
      toActPlayer.needsAction = true;
    }

    if (toActPlayer.kind !== "HUMAN" || !toActPlayer.connected) {
      this.clearPendingHumanTurnTimeout();
      return;
    }

    const beforeTurnStartTs = this.turnManager.getTurnStartTs();
    this.scheduleHumanTurnTimeout(toActUserId);
    const afterTurnStartTs = this.turnManager.getTurnStartTs();
    if (afterTurnStartTs > 0 && afterTurnStartTs !== beforeTurnStartTs) {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          seat: toActPlayer.seat,
          userId: toActUserId,
          timeoutMs: TURN_TIMEOUT_TOTAL_MS,
          trigger,
        },
        "TURN_TIMER_STARTED",
      );
    }
  }

  private maybeSelfHealWaitingHumanWithoutDeadline(trigger: string): void {
    if (this.state.roundState !== "WAITING_FOR_ACTION") return;
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    if (this.state.toActSeat < 0) return;
    if ((this.state.turnDeadlineMs ?? 0) > 0) return;

    const toActUserId = this.state.seats[this.state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || !eligibleToAct(toActPlayer)) return;
    if (toActPlayer.kind !== "HUMAN" || !toActPlayer.connected) return;

    const key = `${this.state.handId}|${this.state.street}|${this.state.toActSeat}`;
    const now = Date.now();
    if (
      key !== this.lastWaitingWithoutDeadlineRepairKey ||
      now - this.lastWaitingWithoutDeadlineRepairLogAt > 5000
    ) {
      logger.error(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          toActSeat: this.state.toActSeat,
          toActUserId,
          trigger,
        },
        "WAITING_WITHOUT_DEADLINE_REPAIRED",
      );
      this.lastWaitingWithoutDeadlineRepairKey = key;
      this.lastWaitingWithoutDeadlineRepairLogAt = now;
    }

    this.ensureHumanTurnTimerForCurrentActor(`SELF_HEAL:${trigger}`);
  }

  private onWaitingForActionEntered(reason: string): void {
    void this.requestDrive(`ROUND_STATE_ENTER:${reason}`);
  }

  async handleAction(userId: string, msg: ActionPayload, actionId?: string, actorClient?: Client) {
    const currentHandIdAtEnqueue = this.state.handId ?? null;
    const queuedAt = Date.now();
    return this.turnManager.enqueuePlayerAction(async () => {
      const queueDelayMs = Date.now() - queuedAt;
      if (queueDelayMs > 100) {
        logger.warn(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            userId,
            action: msg.action,
            actionId,
            delay: queueDelayMs,
            queueDepth: this.turnManager.getQueueDepth(),
          },
          "ACTION_QUEUE_DELAY",
        );
      }
      try {
        if (currentHandIdAtEnqueue && this.state.handId !== currentHandIdAtEnqueue) {
          logger.warn(
            {
              tableId: this.state.tableId,
              handId: this.state.handId,
              userId,
              actionId,
              enqueuedHandId: currentHandIdAtEnqueue,
              currentHandId: this.state.handId,
              street: this.state.street,
            },
            "ACTION_DROPPED_HAND_CHANGED",
          );
          return;
        }
        if (!this.currentHand && this.state.handId && this.state.street !== "WAITING") {
          this.currentHand = new HandContext();
        }
        this.pendingActorRef = actorClient ? { userId, client: actorClient } : null;
        // handContext is read at run time (this.currentHand); currentHandIdAtEnqueue is from enqueue time.
        // If the hand changed in between, sameHand is false and we skip dedup (correct - no record in wrong hand).
        const handContext = this.currentHand;
        const sameHand = handContext && currentHandIdAtEnqueue && this.state.handId === currentHandIdAtEnqueue;
        const actionKey =
          actionId && currentHandIdAtEnqueue ? buildActionKey(currentHandIdAtEnqueue, userId, actionId) : null;
        const claimKey =
          actionId && currentHandIdAtEnqueue ? buildClaimKey(currentHandIdAtEnqueue, actionId) : null;
        if (sameHand && claimKey) {
          const claim = handContext!.recordClaimAndWarnIfCollision(claimKey, userId);
          if (claim.collision) {
            if (claim.shouldLog) {
              const firstUserId = handContext!.actionIdFirstClaimByKey.get(claimKey) ?? "";
              const firstSeat = firstUserId ? (this.state.playersById.get(firstUserId)?.seat ?? null) : null;
              const secondSeat = this.state.playersById.get(userId)?.seat ?? null;
              logger.warn(
                {
                  type: "ACTION_ID_CROSS_USER_COLLISION",
                  handId: currentHandIdAtEnqueue,
                  actionId,
                  firstUserId,
                  firstSeat,
                  secondUserId: userId,
                  secondSeat,
                  userId,
                },
                "ACTION_ID_CROSS_USER_COLLISION",
              );
            }
            logger.warn(
              {
                tableId: this.state.tableId,
                handId: this.state.handId,
                userId,
                actionId,
                action: msg.action,
                reason: "ACTION_ID_CROSS_USER_COLLISION",
              },
              "ACTION_REJECTED",
            );
            this.pendingActorRef = null;
            throw new PokerError(
              "INVALID_ACTION",
              "actionId already claimed by another user in this hand.",
            );
          }
        }
        if (sameHand && actionKey && handContext!.isDuplicate(actionKey)) {
          logger.warn(
            {
              tableId: this.state.tableId,
              handId: this.state.handId,
              userId,
              actionId,
              action: msg.action,
              reason: "DUPLICATE_ACTION",
            },
            "ACTION_REJECTED",
          );
          logger.info(
            { tableId: this.state.tableId, handId: this.state.handId, userId, actionId, action: msg.action },
            "ACTION_DUPLICATE_IGNORED",
          );
          this.pendingActorRef = null;
          return;
        }
        const handIdBefore = this.state.handId;
        try {
          const actionProcessStartedAt = Date.now();
          try {
            await this._handleAction(userId, msg, "PLAYER", actionId);
          } finally {
            dealerRuntimeMetrics.observeActionProcessMs(Date.now() - actionProcessStartedAt);
          }
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
        this.pendingActorRef = null;
      }
    });
  }

  // Legacy test compatibility shim.
  async recordAcceptedPayout(playerId: string, amountCents: number): Promise<void> {
    await this.settlementService.recordAcceptedPayout(playerId, amountCents);
  }

  // ---------------------------------------------------------------------------
  // ACTION HANDLING - PRIVATE IMPLEMENTATION
  // ---------------------------------------------------------------------------
  // Core action execution, result application, and preflop statistics

  private async _handleAction(
    userId: string,
    msg: ActionPayload,
    origin: TableLastAction["origin"],
    actionId?: string,
  ) {
    if (!this.currentHand && this.state.handId && this.state.street !== "WAITING") {
      this.currentHand = new HandContext();
    }
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
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        userId,
        actionId,
        action: msg.action,
      },
      "ACTION_ACCEPTED",
    );
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
    this.handOrchestrator.transitionToWaiting();
  }

  private shouldLogEngineDecision(): boolean {
    if (this.engineDecisionSampleRate <= 0) return false;
    if (
      this.engineDecisionTableIdFilter.length > 0 &&
      this.engineDecisionTableIdFilter !== this.state.tableId
    ) {
      return false;
    }
    return Math.random() <= this.engineDecisionSampleRate;
  }

  private buildEngineDecisionLogPayload(reason: string, now?: number): {
    decisionTraceId: string;
    tableId: string;
    handId: string;
    street: string;
    toActSeat: number;
    toActUserId: string;
    turnDeadlineMs: number;
    step: string;
    stallReason: string | null;
    reason: string;
    now: number;
  } {
    const evalNow = now ?? Date.now();
    const decisionState = this.buildDecisionState(evalNow);
    const runtimeQueries = this.buildRuntimeEngineQueries();
    const step = computeNextStep(decisionState, evalNow, runtimeQueries);
    const stallReason = getStallReason(decisionState, evalNow, runtimeQueries);
    const toActUserId = this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";

    return {
      decisionTraceId: randomUUID(),
      tableId: this.state.tableId,
      handId: this.state.handId,
      street: this.state.street,
      toActSeat: this.state.toActSeat,
      toActUserId,
      turnDeadlineMs: this.state.turnDeadlineMs,
      step,
      stallReason,
      reason,
      now: evalNow,
    };
  }

  private deriveRuntimeStep(now: number): string {
    if (this.state.street === "WAITING") {
      return countNonOutPlayers(this.state) >= 2 ? "START_NEXT_HAND" : "NO_OP";
    }

    if (
      this.state.street === "SHOWDOWN" ||
      this.state.runoutMode === "STAGED" ||
      allRemainingPlayersAllInOrFolded(this.state)
    ) {
      return "RUN_SHOWDOWN";
    }

    if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
      return "ADVANCE_STREET";
    }

    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      return "NO_OP";
    }

    if (toAct.kind === "BOT" || !toAct.connected) {
      return "RUN_BOT_ACTION";
    }

    const turnDeadlineMs = this.state.turnDeadlineMs;
    if (turnDeadlineMs > 0 && now >= turnDeadlineMs) {
      return "AUTO_ACTION_TIMEOUT";
    }

    return "WAIT_FOR_HUMAN";
  }

  private buildDecisionState(now: number): DecisionState {
    void now;
    const turnDeadlineMs = this.state.turnDeadlineMs > 0 ? this.state.turnDeadlineMs : undefined;
    return projectDecisionState({
      tableId: this.state.tableId,
      handId: this.state.handId || undefined,
      street: this.state.street,
      toActSeat: this.state.toActSeat,
      turnDeadlineMs,
      players: [...this.state.playersById.values()].map((p) => ({
        id: p.id,
        seat: p.seat,
        kind: p.kind,
        status: p.status,
        connected: p.connected,
        needsAction: p.needsAction,
      })),
    });
  }

  private buildRuntimeEngineQueries(): EngineQueries {
    return {
      getToActPlayer: (state) => {
        const seat = state.hand?.toActSeat;
        if (seat == null || seat < 0) return undefined;
        return state.players.find((p) => p.seat === seat);
      },
      startNextHandDue: () => this.state.street === "WAITING" && countNonOutPlayers(this.state) >= 2,
      bettingClosed: () => bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state),
      showdownRequired: () =>
        this.state.street === "SHOWDOWN" ||
        this.state.runoutMode === "STAGED" ||
        allRemainingPlayersAllInOrFolded(this.state),
      botActionDue: () => {
        const toActId = this.state.seats[this.state.toActSeat] ?? "";
        const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
        return !!toAct && eligibleToAct(toAct) && toAct.needsAction && (toAct.kind === "BOT" || !toAct.connected);
      },
      humanTurnExpired: (state, currentNow) => {
        const toActId = this.state.seats[this.state.toActSeat] ?? "";
        const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
        if (!toAct || toAct.kind !== "HUMAN" || !toAct.connected || !toAct.needsAction) return false;
        const deadline = state.hand?.turnDeadlineMs;
        if (deadline == null || deadline <= 0) return false;
        return currentNow >= deadline;
      },
    };
  }

  private logEngineDecision(reason: string, now?: number): void {
    if (!this.shouldLogEngineDecision()) return;
    logger.info(this.buildEngineDecisionLogPayload(reason, now), "ENGINE_DECISION");
  }

  private logEngineDecisionAndRuntimeStep(reason: string, now?: number): void {
    if (!this.shouldLogEngineDecision()) return;
    const payload = this.buildEngineDecisionLogPayload(reason, now);
    const runtimeStep = this.deriveRuntimeStep(payload.now);
    const parityMatch = payload.step === runtimeStep;
    dealerRuntimeMetrics.observeDecisionParity(parityMatch);
    logger.info(payload, "ENGINE_DECISION");
    logger.info(
      {
        ...payload,
        runtimeStep,
      },
      "ENGINE_RUNTIME_STEP",
    );
    logger.info(
      {
        tableId: payload.tableId,
        handId: payload.handId,
        decisionTraceId: payload.decisionTraceId,
        reason: payload.reason,
        decisionStep: payload.step,
        runtimeStep,
        match: parityMatch,
      },
      "ENGINE_PARITY",
    );
    if (!parityMatch) {
      logger.warn(
        {
          tableId: payload.tableId,
          handId: payload.handId,
          decisionTraceId: payload.decisionTraceId,
          reason: payload.reason,
          decisionStep: payload.step,
          runtimeStep,
          street: payload.street,
          toActSeat: payload.toActSeat,
          toActUserId: payload.toActUserId,
          turnDeadlineMs: payload.turnDeadlineMs,
        },
        "ENGINE_PARITY_MISMATCH",
      );
    }
  }

  /** Phase-1 observability: sampled decision trace emission from external monitors. */
  logEngineDecisionPublic(reason: string, now?: number): void {
    this.logEngineDecision(reason, now);
  }

  /** Phase-3 stall authority helper for room-level monitoring. */
  getStallReasonPublic(now?: number): StallReason | null {
    const evalNow = now ?? Date.now();
    const decisionState = this.buildDecisionState(evalNow);
    return getStallReason(decisionState, evalNow, this.buildRuntimeEngineQueries());
  }

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Hand initiation, street progression, and completion scenarios

  private async startHand() {
    await this.handOrchestrator.startHand();
    dealerRuntimeMetrics.recordHandStarted();
    this.logEngineDecisionAndRuntimeStep("START_HAND");
  }

  private async advanceStreetOrShowdown() {
    await this.handOrchestrator.advanceStreetOrShowdown();
    this.logEngineDecisionAndRuntimeStep("ADVANCE_STREET_OR_SHOWDOWN");
  }

  private async finishHandByLastStanding() {
    await this.handOrchestrator.finishHandByLastStanding();
    this.logEngineDecisionAndRuntimeStep("FINISH_HAND_LAST_STANDING");
  }
  private async finishHandShowdownWithSidePots() {
    await this.handOrchestrator.finishHandShowdownWithSidePots();
    this.logEngineDecisionAndRuntimeStep("FINISH_HAND_SHOWDOWN");
  }

  /**
   * Phase-0 boundary placeholder for unified deterministic table progression.
   * Captures time once at the boundary; later phases will make this authoritative.
   */
  private async requestDrive(reason: string, now?: number): Promise<void> {
    const driveNow = now ?? Date.now();
    const runDriveChecks = (trigger: string): void => {
      this.ensureHumanTurnTimerForCurrentActor(trigger);
      this.maybeSelfHealWaitingHumanWithoutDeadline(trigger);
      this.logEngineDecisionState(trigger);
      this.logToActDerivationWarning(trigger);
      this.logEngineDecisionAndRuntimeStep(trigger, driveNow);
    };
    switch (reason) {
      // Phase 7 Step D (single trigger path): keep equivalent behavior while
      // routing progression checks through requestDrive boundary.
      case "ACTION_RESOLVED_NEXT_ACTOR":
        runDriveChecks("ACTION_RESOLVED_NEXT_ACTOR");
        return;
      // Phase 7 Step E: second trigger path routed through requestDrive.
      default:
        if (reason.startsWith("START_HAND:")) {
          await this.startHand();
          return;
        }
        if (reason.startsWith("ADVANCE_STREET_OR_SHOWDOWN:")) {
          await this.advanceStreetOrShowdown();
          return;
        }
        if (reason.startsWith("FINISH_HAND_LAST_STANDING:")) {
          await this.finishHandByLastStanding();
          return;
        }
        if (reason.startsWith("MAYBE_ACT_FOR_BOT:")) {
          this.maybeActForBot();
          runDriveChecks(reason);
          return;
        }
        if (reason.startsWith("ROUND_STATE_ENTER:")) {
          this.maybeActForBot();
          runDriveChecks(reason);
          return;
        }
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // PLAN EXECUTION ENGINE
  // ---------------------------------------------------------------------------
  // Execute lifecycle plans from various service layers

  private async executeHandLifecyclePlans(plans: HandLifecyclePlan[]): Promise<void> {
    await this.lifecycleExecutor.executeHandLifecyclePlans(plans);
  }

  private async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[]): Promise<void> {
    await this.lifecycleExecutor.executePlayerLifecyclePlans(plans);
  }

  private async runHandEndedAwards(
    plan: Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>
  ): Promise<void> {
    dealerRuntimeMetrics.recordHandCompleted();
    await this.handOrchestrator.runHandEndedAwards(plan);
  }

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE HELPER METHODS
  // ---------------------------------------------------------------------------
  // Support functions for hand progression, seat management, and player removal

  private async ensureHandAdvancingAfterPlayerRemoval(removedSeat: number) {
    if (this.state.street === "WAITING") {
      if (countNonOutPlayers(this.state) >= 2) await this.requestDrive("START_HAND:ENSURE_HAND_ADVANCE_WAITING");
      return;
    }
    if (this.state.runoutMode === "STAGED") return;

    if (countNotFoldedPlayers(this.state) <= 1) {
      await this.requestDrive("FINISH_HAND_LAST_STANDING:ENSURE_HAND_ADVANCE_LAST_PLAYER");
      return;
    }

    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
        await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:ENSURE_HAND_ADVANCE_BETTING_CLOSED");
      } else {
        const nextSeat = findNextToActSeat(this.state, removedSeat);
        if (nextSeat === -1) {
          await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:ENSURE_HAND_ADVANCE_NO_NEXT_SEAT");
          return;
        }
        this.state.toActSeat = nextSeat;
        this.requestDrive("MAYBE_ACT_FOR_BOT:ENSURE_HAND_ADVANCE:NO_ELIGIBLE_TO_ACT");
      }
    } else {
      this.requestDrive("MAYBE_ACT_FOR_BOT:ENSURE_HAND_ADVANCE:TO_ACT_ELIGIBLE");
    }
  }

  private scheduleNextHand(reason: string, delayMs = 0) {
    this.handOrchestrator.scheduleNextHand(reason, delayMs);
  }

  private async releasePendingSeats() {
    const nowTs = Date.now();
    const toRelease = [...this.pendingSeatReleaseUserIds];
    this.pendingSeatReleaseUserIds.clear();
    for (const userId of toRelease) {
      const player = this.state.playersById.get(userId);
      if (player && !player.connected && (player.disconnectDeadlineTs ?? 0) === 0) {
        logger.warn(
          { userId, tableId: this.state.tableId, status: player.status, pendingRemovalReason: player.pendingRemovalReason },
          "DISCONNECTED_PLAYER_WITHOUT_RECONNECT_DEADLINE",
        );
      }
      const protectedDisconnectSeat =
        !!player &&
        !player.connected &&
        (player.disconnectDeadlineTs ?? 0) > 0 &&
        nowTs <= (player.disconnectDeadlineTs ?? 0);
      if (protectedDisconnectSeat) {
        // Keep the pending removal queued, but do not release the seat until
        // the reconnect grace window has actually expired.
        this.pendingSeatReleaseUserIds.add(userId);
        continue;
      }
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
    options?: { connected?: boolean; sittingOut?: boolean; reconnectTimeoutMs?: number },
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
      if (player.connected) {
        player.disconnectDeadlineTs = 0;
      }
      player.needsAction = false;

      if (player.stackCents <= 0) {
        player.status = "OUT";
        await this.sendTableSnapshotToAll("SEAT_CHANGE");
        return;
      }

      if (player.status !== "OUT") {
        player.status = "ABANDONED";
      }

      if (this.state.street === "WAITING") {
        await this.sendTableSnapshotToAll("SEAT_CHANGE");
        return;
      }

      if (countNotFoldedPlayers(this.state) <= 1) {
        await this.requestDrive("FINISH_HAND_LAST_STANDING:SIT_OUT_LAST_PLAYER");
        return;
      }

      if (this.state.toActSeat === player.seat) {
        if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
          await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:SIT_OUT_BETTING_CLOSED");
          return;
        }
        const nextSeat = findNextToActSeat(this.state, player.seat);
        if (nextSeat === -1) {
          await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:SIT_OUT_NO_NEXT_SEAT");
          return;
        }
        this.state.toActSeat = nextSeat;
      }

      await this.sendTableSnapshotToAll("SEAT_CHANGE");
      this.requestDrive("MAYBE_ACT_FOR_BOT:SIT_OUT_SEAT_CHANGE");
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
        await this.requestDrive("START_HAND:SIT_IN_WAITING");
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
        this.logActionResolvedNextActor();
        return;
      case "WAITING_FOR_PLAYERS":
        await this.sendTableSnapshotToAll("AUTO_TRANSITION");
        maybeAssertBettingState(this.state);
        this.logActionResolvedNextActor();
        return;
      case "HAND_FINISHED":
        await this.requestDrive("FINISH_HAND_LAST_STANDING:APPLY_ACTION_RESULT_HAND_FINISHED");
        maybeAssertBettingState(this.state);
        this.logActionResolvedNextActor();
        return;
      case "STREET_COMPLETE":
        await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:APPLY_ACTION_RESULT_STREET_COMPLETE");
        maybeAssertBettingState(this.state);
        this.logActionResolvedNextActor();
        return;
      case "TURN_ADVANCED":
        await this.sendTableSnapshotToAll(options?.turnAdvancedReason ?? "ACTION_ACCEPTED", `act_${this.state.handId}_${this.state.handActionSeq}`);
        maybeAssertBettingState(this.state);
        this.requestDrive("MAYBE_ACT_FOR_BOT:APPLY_ACTION_RESULT:TURN_ADVANCED");
        this.logActionResolvedNextActor();
        return;
    }
  }

  private logActionResolvedNextActor(): void {
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        nextSeat: this.state.toActSeat,
      },
      "ACTION_RESOLVED_NEXT_ACTOR",
    );

    // Turn-Owner Invariant Guard:
    // If the hand is active (not WAITING or SHOWDOWN), we must have a valid scheduled next action.
    if (this.state.street !== "WAITING" && this.state.street !== "SHOWDOWN" && this.state.toActSeat >= 0) {
      const seatUser = this.state.seats[this.state.toActSeat];
      if (!seatUser) {
        logger.error(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            street: this.state.street,
            toActSeat: this.state.toActSeat,
          },
          "TURN_OWNER_INVARIANT_VIOLATION",
        );
    void this.requestDrive("MAYBE_ACT_FOR_BOT:TURN_OWNER_INVARIANT_VIOLATION");
      }
    }

    void this.requestDrive("ACTION_RESOLVED_NEXT_ACTOR");
  }

  private logEngineDecisionState(trigger: string): void {
    const toActUserId = this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        toActUserId,
        needsAction: toActPlayer?.needsAction ?? null,
        actorKind: toActPlayer?.kind ?? null,
        actorConnected: toActPlayer?.connected ?? null,
        deadline: this.state.turnDeadlineMs,
        runoutMode: this.state.runoutMode,
        queueDepth: this.turnManager.getQueueDepth(),
        trigger,
      },
      "ENGINE_DECISION_STATE",
    );
  }

  private logToActDerivationWarning(trigger: string): void {
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) return;
    if (this.state.maxSeats <= 0) return;

    const pivot = this.state.toActSeat >= 0
      ? ((this.state.toActSeat - 1 + this.state.maxSeats) % this.state.maxSeats)
      : (this.state.maxSeats - 1);
    const derivedToAct = findNextToActSeat(this.state, pivot);
    if (derivedToAct === -1) return;
    if (derivedToAct === this.state.toActSeat) return;

    logger.warn(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        toActSeatStored: this.state.toActSeat,
        toActSeatDerived: derivedToAct,
        trigger,
      },
      "TO_ACT_DERIVATION_MISMATCH",
    );
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

  /**
   * Public surface for stall-recovery callers (e.g. PokerRoom stall monitor).
   * Delegates to the private maybeActForBot so the encapsulation boundary is clear.
   */
  maybeActForBotPublic(): void {
    void this.requestDrive("MAYBE_ACT_FOR_BOT:PUBLIC");
  }

  private async applyDisconnectedAutoActionCapForHand() {
    await this.turnAutomationService.applyDisconnectedAutoActionCapForHand();
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") {
      return;
    }

    // Auto-action cap can demote an ACTIVE actor to ABANDONED mid-hand.
    // Re-sync bet level and advance turn if current toAct is no longer eligible.
    syncRoundCurrentBetCents(this.state);

    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      const nextSeat = findNextToActSeat(this.state, this.state.toActSeat);
      if (nextSeat === -1) return;
      this.state.toActSeat = nextSeat;
      this.requestDrive("MAYBE_ACT_FOR_BOT:DISCONNECTED_AUTO_ACTION_CAP");
    }
  }

  /**
   * Schedule a human turn timeout for the current actor.
   *
   * - Uses the same queued mutation pipeline and turn token concept as auto-actions.
   * - Dedupes per (handId, street, handActionSeq, toActSeat, toActUserId) so we only
   *   have one timeout active per logical turn.
   * - At fire time, re-validates that the token is still current and that the player
   *   still needs action before auto-sitting them out.
   */
  private enqueueSerializedStateMutation(work: () => Promise<void>): Promise<void> {
    return this.turnManager.enqueueSerializedStateMutation(work);
  }

  // ---------------------------------------------------------------------------
  // DISCONNECT DEADLINE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Periodic cleanup of abandoned players and deadline enforcement

  private startDisconnectSweep(): void {
    this.disconnectManager.startSweep();
  }

  stopDisconnectSweep(): void {
    this.disconnectManager.stopSweep();
  }

  /** Call when room is being destroyed to prevent timeout callbacks on dead instances */
  dispose(): void {
    this.disposed = true;
    this.handOrchestrator.dispose();
    this.clearPendingHumanTurnTimeout();
    this.disconnectManager.dispose();
  }

  private clearPendingHumanTurnTimeout(): void {
    this.turnManager.clearPendingHumanTurnTimeout();
  }

  getQueueDepth(): number {
    return this.turnManager.getQueueDepth();
  }

  /**
   * Optional turn-level stall detection. Call from room stall check interval.
   * Logs TURN_STALLED when waiting for a human and turn has exceeded timeout + 5s.
   */
  logTurnStalledIfNeeded(): void {
    if (this.state.toActSeat < 0) return;
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    const turnDeadlineMs = this.state.turnDeadlineMs;
    if (turnDeadlineMs <= 0) return;
    if (Date.now() <= turnDeadlineMs + 5000) return;
    logger.warn(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        seat: this.state.toActSeat,
        street: this.state.street,
        turnDeadlineMs,
      },
      "TURN_STALLED",
    );
  }

  // ---------------------------------------------------------------------------
  // SNAPSHOT DELEGATION - INTERNAL USE
  // ---------------------------------------------------------------------------
  // Internal snapshot emission (public API available for single-user emits)

  private async sendTableSnapshotToAll(reason: SnapshotReason, actionId?: string): Promise<void> {
    const ensureRecipient = this.pendingActorRef
      ? { userId: this.pendingActorRef.userId, client: this.pendingActorRef.client }
      : undefined;
    await this.snapshotService.emitToAll(reason, actionId, ensureRecipient);
  }

}

