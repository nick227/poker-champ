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
  countNonOutPlayers,
  countNotFoldedPlayers,
  findNextToActSeat,
  resolveActivePlayersForHand,
  resolvePlayersReadyForNextHand,
} from "./dealer/utils/TableNavigator.js";
import {
  eligibleToAct,
  bettingRoundComplete,
  noFurtherBettingPossible,
  syncRoundCurrentBetCents,
  allRemainingPlayersAllInOrFolded,
} from "./rules/BettingRound.js";
import { PokerError } from "./errors.js";
import { PersistenceFacade } from "./persistence/PersistenceFacade.js";
import { type TableLastAction, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { BotResolver } from "./bots/BotResolver.js";
import { SnapshotService, type SnapshotReason } from "./dealer/hand/SnapshotService.js";
import { ActionService, type ActionResult, type ActionServiceLastAction } from "./dealer/turn/ActionService.js";
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
import { buildHandHistoryRoster } from "./dealer/utils/handHistoryRoster.js";
import { HandContext } from "./dealer/HandContext.js";
import { computeNextStep, getStallReason, projectDecisionState, type DecisionState, type NextStepOwner, type StallReason } from "./dealer/decision/index.js";
import type { EngineQueries } from "./dealer/decision/engineQueries.js";
import { dealerRuntimeMetrics } from "./dealer/metrics/dealerRuntimeMetrics.js";
import {
  DealerDiagnostics,
  type DealerDiagnosticEvent,
} from "./dealer/orchestration/DealerDiagnostics.js";
import { DealerActionOrchestrator } from "./dealer/orchestration/DealerActionOrchestrator.js";
import { DealerProgressionCoordinator } from "./dealer/orchestration/DealerProgressionCoordinator.js";
export type {
  DealerDiagnosticEvent,
  DealerDiagnosticType,
} from "./dealer/orchestration/DealerDiagnostics.js";

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
  onTournamentWaitingAfterHand?: () => Promise<void> | void;
  isNextHandBlocked?: () => boolean;
  getTournamentTableOverlay?: () => import("../tournaments/tournament-overlay.js").TournamentTableOverlay | null;
  onSoakTimingEvent?: (args: {
    kind:
      | "LIFECYCLE_PLAN_EMIT_SNAPSHOT_MS"
      | "LIFECYCLE_PLAN_HAND_ENDED_MS"
      | "LIFECYCLE_PLAN_DELAY_MS"
      | "LIFECYCLE_PLAN_SCHEDULE_NEXT_HAND_MS"
      | "HAND_ENDED_AWARDS_MS";
    handId: string;
    street: string;
    durationMs: number;
    queueItem: ReturnType<Dealer["getCurrentQueueItem"]> | null;
    reason?: string | null;
    actionId?: string | null;
    branch?: string | null;
    delayMs?: number | null;
    countdownMs?: number | null;
    potCents?: number | null;
  }) => void;
};

type DealerSoakTimingEvent = Omit<
  Parameters<NonNullable<DealerConstructorOptions["onSoakTimingEvent"]>>[0],
  "queueItem"
>;

type AddBotOptions = {
  inertDuringSeed?: boolean;
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
  private readonly diagnostics: DealerDiagnostics;
  private readonly actionOrchestrator: DealerActionOrchestrator;
  private readonly progression: DealerProgressionCoordinator;

  addDiagnosticListener(
    listener: (event: DealerDiagnosticEvent) => void,
  ): () => void {
    return this.diagnostics.addDiagnosticListener(listener);
  }

  private emitDiagnostic(event: DealerDiagnosticEvent): void {
    this.diagnostics.emitDiagnostic(event);
  }

  private buildDiagnosticContext(context?: Record<string, unknown>): Record<string, unknown> {
    return this.diagnostics.buildDiagnosticContext(context);
  }

  private emitLifecycleDeferredRemovalDiagnostic(userId: string, reason: string): void {
    this.diagnostics.emitLifecycleDeferredRemovalDiagnostic(userId, reason);
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

  private pendingBotActionTimeoutIds = new Set<ReturnType<typeof setTimeout>>();

  private setNextStepOwner(owner: NextStepOwner, trigger: string): void {
    if (this.nextStepOwner !== owner) {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          from: this.nextStepOwner,
          to: owner,
          trigger,
        },
        "NEXT_STEP_OWNER_CHANGED",
      );
    }
    this.nextStepOwner = owner;
  }

  /**
   * Direct bot action scheduler — bypasses AutoActionDispatcher's stale-token queue.
   *
   * The previous path (enqueueInternalAction → AutoActionDispatcher) captured a turn
   * token, waited delayMs, then silently discarded the action if the token was stale.
   * On discard, onAutoActionDiscarded called requestDrive, but this created a timing
   * window where a post-street-transition bot could get lost (RCA: rca-game-hang-2026-03-09).
   *
   * This path:
   *  1. Captures the minimal staleness keys at schedule time.
   *  2. Waits delayMs via setTimeout.
   *  3. On fire: if stale, calls requestDrive explicitly (not silently).
   *  4. If fresh: routes through handleAction → enqueuePlayerAction (serialized queue).
   */
  private scheduleBotAction(botId: string, payload: ActionPayload, delayMs: number): void {
    const capturedHandId = this.state.handId;
    const capturedStreet = this.state.street;
    const capturedHandActionSeq = this.state.handActionSeq;
    const capturedToActSeat = this.state.toActSeat;
    const fire = () => {
      if (this.disposed) return;
      if (capturedHandId && this.activeTerminalLifecycle?.handId === capturedHandId) {
        return;
      }
      const stale =
        this.state.handId !== capturedHandId ||
        this.state.street !== capturedStreet ||
        this.state.handActionSeq !== capturedHandActionSeq ||
        this.state.toActSeat !== capturedToActSeat;
      if (stale) {
        const crossedHandBoundary = this.state.handId !== capturedHandId;
        const crossedStreetBoundary = this.state.street !== capturedStreet;
        if (crossedHandBoundary || crossedStreetBoundary) {
          logger.info(
            {
              tableId: this.state.tableId,
              handId: capturedHandId,
              botId,
              capturedHandId,
              capturedStreet,
              capturedHandActionSeq,
              currentHandId: this.state.handId,
              currentStreet: this.state.street,
              currentHandActionSeq: this.state.handActionSeq,
            },
            "BOT_SCHEDULED_ACTION_STALE",
          );
        }
        // Explicitly re-drive rather than silently discarding.
        // Must serialize through the queue: driveGame() can call lifecycle functions
        // directly, and unqueued state mutations would race with the action queue.
        void this.enqueueSerializedStateMutation(() => this.driveGame("BOT_SCHEDULED_ACTION_STALE"));
        return;
      }
      // Route through the serialized queue so concurrent player actions interleave safely.
      void (async () => {
        await this.handleAction(botId, payload);
        logger.info({ botId, action: payload.action }, "DRIVE_CALLED_AFTER_BOT_ACTION");
        await this.driveGame("BOT_ACTION_EXECUTED");
      })();
    };

    const effectiveDelayMs = delayMs <= 0 ? 0 : delayMs;
    const timeoutId = setTimeout(() => {
      this.pendingBotActionTimeoutIds.delete(timeoutId);
      fire();
    }, effectiveDelayMs);
    this.pendingBotActionTimeoutIds.add(timeoutId);
  }

  // ---------------------------------------------------------------------------
  // CORE STATE & SERVICE DEPENDENCIES
  // ---------------------------------------------------------------------------
  // Persistent table state and service infrastructure

  private readonly state: PokerState;
  private readonly persistence: PersistenceFacade;
  private readonly clientsByUserId: Map<string, Client> = new Map();

  private pendingSeatReleaseUserIds: Set<string> = new Set();
  private lastDriveMarker = "INIT";
  private readonly lastAcceptedActionSnapshotByHandId = new Map<
    string,
    {
      handId: string;
      userId: string;
      action: string;
      amountCents: number | null;
      resultingToActSeat: number;
      resultingRoundState: string;
      resultingStreet: string;
      resultingResolvedActionId: string | undefined;
      lastAction: TableLastAction | null;
    }
  >();
  /** Displayed after hand ends during WAITING; set by HandLifecycleService callback. */
  private lastHandResult: TableSnapshotPayload["lastHandResult"] | undefined = undefined;
  /** Latest accepted player action id exposed in snapshots for client-side reconciliation. */
  private resolvedActionId: string | undefined = undefined;
  /**
   * Explicit next-step ownership: tracks which component is responsible for
   * the next hand progression step. Set after every state mutation so
   * "who drives next?" is always observable without cross-service reasoning.
   */
  private nextStepOwner: NextStepOwner = "IDLE";
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
  private lastDecisionTraceId: string | null = null;
  private driveInProgress = false;
  private driveQueued = false;
  private driveQueuedReason = "";
  private drivePromise: Promise<void> | null = null;
  private activeTerminalLifecycle:
    | { handId: string; path: "LAST_STANDING" | "SHOWDOWN"; caller: string }
    | null = null;
  private completedTerminalLifecycle:
    | { handId: string; path: "LAST_STANDING" | "SHOWDOWN"; caller: string }
    | null = null;
  private pendingExternalPlayerLifecycleBatches: Array<{
    source: string;
    plans: PlayerLifecyclePlan[];
  }> = [];
  private gameplayTransitionSuppressionDepth = 0;

  /** One hand. Created at HAND_START, cleared when transitioning to WAITING. */
  private currentHand: HandContext | null = null;

  private readonly turnManager: TurnManager;
  private disposed = false;
  private readonly onHandEndedAwards?: HandEndedAwardsCallback;
  private readonly onTournamentWaitingAfterHand?: DealerConstructorOptions["onTournamentWaitingAfterHand"];
  private readonly isNextHandBlocked?: DealerConstructorOptions["isNextHandBlocked"];
  private readonly getTournamentTableOverlay?: DealerConstructorOptions["getTournamentTableOverlay"];
  private readonly onSoakTimingEvent?: DealerConstructorOptions["onSoakTimingEvent"];

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
    this.diagnostics = new DealerDiagnostics({
      state: this.state,
      getQueueDepth: () => this.turnManager.getQueueDepth(),
      getNextStepOwner: () => this.nextStepOwner,
      isDriveQueued: () => this.driveQueued,
      hasActiveTerminalLifecycle: () => this.activeTerminalLifecycle !== null,
      hasCompletedTerminalLifecycle: () => this.completedTerminalLifecycle !== null,
    });
    this.onHandEndedAwards = options?.onHandEndedAwards;
    this.onTournamentWaitingAfterHand = options?.onTournamentWaitingAfterHand;
    this.isNextHandBlocked = options?.isNextHandBlocked;
    this.getTournamentTableOverlay = options?.getTournamentTableOverlay;
    this.onSoakTimingEvent = options?.onSoakTimingEvent;
    this.persistence =
      persistence ??
      new PersistenceFacade({
        tableId: this.state.tableId || "table_poc",
        tableName: this.state.tableName,
      });
    const externalOnAutoSitOutReachedCap = options?.onAutoSitOutReachedCap;
    this.onAutoSitOutReachedCap = async (args) => {
      if (externalOnAutoSitOutReachedCap) {
        await externalOnAutoSitOutReachedCap(args);
      }

      // ❗ ONLY if this path is triggered from async context
      // Since this is called from inside lifecycle/drive loop, no drive needed
      // await this.driveGame("AUTO_ACTION_CAP_REACHED");
    };
    this.turnManager = new TurnManager({
      state: this.state,
      maxQueueDepth: options?.maxQueueDepth ?? 50,
      isDisposed: () => this.disposed,
      emitDiagnostic: (event) => this.emitDiagnostic(event),
      buildDiagnosticContext: (context) => this.buildDiagnosticContext(context),
      handleInternalAction: (userId, payload) => this._handleAction(userId, payload, "AUTO"),
      setPlayerSittingOutInternal: (userId, sittingOut) => this.setPlayerSittingOutInternal(userId, sittingOut),
      onAutoActionDiscarded: () => {
        void this.enqueueSerializedStateMutation(() => this.driveGame("AUTO_ACTION_DISCARDED"));
      },
      driveGame: (reason) => this.driveGame(reason),
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
      onWaitingForActionEntered: undefined,
    });
    this.handOrchestrator = new HandOrchestrator({
      state: this.state,
      handLifecycleService: this.handLifecycleService,
      clearPendingHumanTurnTimeout: () => this.clearPendingHumanTurnTimeout(),
      createHandContext: () => new HandContext(),
      setCurrentHand: (hand) => { this.currentHand = hand; },
      getCurrentHand: () => this.currentHand,
      initPreflopFlagsForHand: () => this.initPreflopFlagsForHand(),
      executeHandLifecyclePlans: (plans) => this.executeHandLifecyclePlans(plans, "HAND_ORCHESTRATOR"),
      requestDrive: (reason) => this.requestDrive(`HAND_ORCHESTRATOR:${reason}`),
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
      onHandEndedAwardsTiming: (event) => {
        this.emitSoakTimingEvent({
          kind: "HAND_ENDED_AWARDS_MS",
          handId: event.handId,
          street: event.street,
          durationMs: event.durationMs,
          reason: event.reason ?? null,
        });
      },
      onScheduleNextHandTiming: (event) => {
        this.emitSoakTimingEvent({
          kind: "LIFECYCLE_PLAN_SCHEDULE_NEXT_HAND_MS",
          handId: event.handId,
          street: event.street,
          durationMs: event.durationMs,
          reason: event.reason ?? null,
          branch: event.branch ?? null,
          delayMs: event.delayMs ?? null,
          countdownMs: event.countdownMs ?? null,
        });
      },
    });
    this.turnAutomationService = new TurnAutomationService({
      state: this.state,
      botResolver: this.botResolver,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      autoActionsByUserId: this.autoActionsByUserId,
      currentHandAutoActedUserIds: this.currentHandAutoActedUserIds,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      enqueueAction: (userId, payload, delayMs) => this.turnManager.enqueueInternalAction(userId, payload, delayMs),
      scheduleBotAction: (userId, payload, delayMs) => this.scheduleBotAction(userId, payload, delayMs),
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
        logger.info(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            street: this.state.street,
            userId,
            nextStepOwner: this.nextStepOwner,
            queueDepth: this.getQueueDepth(),
            currentQueueItem: this.getCurrentQueueItem(),
            lastQueueTransition: this.getLastQueueTransition(),
          },
          "DISCONNECT_SWEEP_RECONNECT_START",
        );
        const plans = this.playerLifecycleService.markReconnected(userId);
        this.stageExternalPlayerLifecyclePlans(plans, "DISCONNECT_SWEEP:MARK_RECONNECTED");
        await this.requestDrive("DISCONNECT_SWEEP:MARK_RECONNECTED");
        logger.info(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            street: this.state.street,
            userId,
            nextStepOwner: this.nextStepOwner,
            queueDepth: this.getQueueDepth(),
            currentQueueItem: this.getCurrentQueueItem(),
            lastQueueTransition: this.getLastQueueTransition(),
          },
          "DISCONNECT_SWEEP_RECONNECT_COMPLETE",
        );
      },
      markAbandoned: (userId) => this.markAbandoned(userId),
    });
    this.lifecycleExecutor = new LifecycleExecutor({
      sendTableSnapshotToAll: (reason, actionId) => this.sendTableSnapshotToAll(reason, actionId),
      isDisposed: () => this.disposed,
      flushSessionStatsOnly: () => this.flushSessionStatsOnly(),
      maybeActForBot: async () => {
        this.queueDrive("MAYBE_ACT_FOR_BOT:LIFECYCLE_EXECUTOR");
      },
      getLifecycleLogContext: () => ({
        tableId: this.state.tableId,
        handId: this.state.handId ?? "",
        street: this.state.street,
      }),
      onLifecyclePlanCompleted: ({ scope, plan, context }) =>
        this.logLifecycleOwnershipLeakIfNeeded(scope, plan, context),
      onLifecyclePlanTiming: ({ handId, street, plan, durationMs, reason, actionId, potCents, delayMs }) => {
        if (plan === "EMIT_SNAPSHOT") {
          this.emitSoakTimingEvent({
            kind: "LIFECYCLE_PLAN_EMIT_SNAPSHOT_MS",
            handId,
            street,
            durationMs,
            reason: reason ?? null,
            actionId: actionId ?? null,
          });
          return;
        }
        if (plan === "HAND_ENDED") {
          this.emitSoakTimingEvent({
            kind: "LIFECYCLE_PLAN_HAND_ENDED_MS",
            handId,
            street,
            durationMs,
            reason: reason ?? null,
            potCents: potCents ?? null,
          });
          return;
        }
        if (plan === "DELAY") {
          this.emitSoakTimingEvent({
            kind: "LIFECYCLE_PLAN_DELAY_MS",
            handId,
            street,
            durationMs,
            delayMs: delayMs ?? null,
          });
        }
      },
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
      finishHandByLastStanding: () => this.finishHandByLastStanding("LIFECYCLE_EXECUTOR:FINISH_HAND_BY_LAST_STANDING"),
      advanceStreetOrShowdown: () => this.advanceStreetOrShowdown("LIFECYCLE_EXECUTOR:ADVANCE_STREET_OR_SHOWDOWN"),
    });
    this.snapshotService = new SnapshotService({
      state: this.state,
      clientsByUserId: this.clientsByUserId,
      getHoleCardsByPlayerId: () => this.currentHand?.holeCardsByPlayerId ?? new Map(),
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      getResolvedActionId: () => this.resolvedActionId,
      getLastHandResult: () => this.lastHandResult,
      getLastAction: () => this.currentHand?.lastAction,
      getHeroSessionStats: (userId) => this.sessionStatsTracker.get(userId),
      emitHook: options?.onTableSnapshotEmitted,
      getAvatarByUserId: options?.getAvatarByUserId,
      getTurnTimeoutTotalMs: () => TURN_TIMEOUT_TOTAL_MS,
      getTournamentTableOverlay: () => this.getTournamentTableOverlay?.() ?? null,
    });
    this.actionService = new ActionService({
      state: this.state,
      getHeroActionOptions: (userId) => this.actionOptionsService.buildHeroActionOptions(this.state, userId),
      getLastAction: () => this.currentHand?.lastAction,
    });
    this.progression = new DealerProgressionCoordinator({
      requestDriveImpl: (trigger) => this.requestDrive(trigger),
      queueDriveImpl: (trigger) => this.queueDrive(trigger),
    });
    this.actionOrchestrator = new DealerActionOrchestrator({
      state: this.state,
      turnManager: this.turnManager,
      actionService: this.actionService,
      settlementService: this.settlementService,
      getCurrentHand: () => this.currentHand,
      ensureCurrentHand: () => {
        if (!this.currentHand && this.state.handId && this.state.street !== "WAITING") {
          this.currentHand = new HandContext();
        }
        return this.currentHand;
      },
      setPendingActorRef: (value) => { this.pendingActorRef = value; },
      setResolvedActionId: (value) => { this.resolvedActionId = value; },
      getResolvedActionId: () => this.resolvedActionId,
      emitDiagnostic: (event) => this.emitDiagnostic(event),
      buildDiagnosticContext: (context) => this.buildDiagnosticContext(context),
      handleInternalAction: (userId, msg, origin, actionId) => this._handleAction(userId, msg, origin, actionId),
      applyActionResult: (result, options) => this.applyActionResult(result, options),
      setLastActionFromExecution: (lastAction) => this.setLastActionFromExecution(lastAction),
      updatePreflopFlagsAfterAction: (userId, lastAction, roundBetBefore) => {
        this.updatePreflopFlagsAfterAction(userId, lastAction, roundBetBefore);
      },
      sendTableSnapshotToAll: (reason) => this.sendTableSnapshotToAll(reason),
      progression: this.progression,
      reconcileAutomationOwnershipAfterTurnAdvancedWithoutDrive: () =>
        this.reconcileAutomationOwnershipAfterTurnAdvancedWithoutDrive(),
      reconcilePostActionLifecycleIfNeeded: (kind) => this.reconcilePostActionLifecycleIfNeeded(kind),
      logActionResolvedNextActor: () => this.logActionResolvedNextActor(),
      recordLastAcceptedActionSnapshot: (args) => this.recordLastAcceptedActionSnapshot(args),
      hasActiveTerminalLifecycleForCurrentHand: () => this.activeTerminalLifecycle?.handId === this.state.handId,
    });
    this.startDisconnectSweep();
    if (this.state.seats.length === 0) {
      for (let i = 0; i < (this.state.maxSeats || 9); i++) this.state.seats.push("");
    }
  }

  private emitSoakTimingEvent(
    event: DealerSoakTimingEvent,
  ): void {
    const queueItem = this.getCurrentQueueItem();
    if (!queueItem || queueItem.handId !== event.handId) return;
    this.onSoakTimingEvent?.({
      ...event,
      queueItem,
    });
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

  async addTournamentPlayer(
    userId: string,
    name: string,
    startingStackCents: number,
    tournamentId: string,
    externalRef: string,
  ) {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addTournamentPlayer(
        userId,
        name,
        startingStackCents,
        tournamentId,
        externalRef,
      );
      await this.applyExternalPlayerLifecyclePlans(plans, "ADD_TOURNAMENT_PLAYER");
    });
  }

  async addTournamentBotPlayer(
    userId: string,
    name: string,
    catalogBotId: string,
    startingStackCents: number,
    tournamentId: string,
    externalRef: string,
    options?: AddBotOptions,
  ) {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addTournamentBotPlayer(
        userId,
        name,
        catalogBotId,
        startingStackCents,
        tournamentId,
        externalRef,
        options,
      );
      await this.applyExternalPlayerLifecyclePlans(plans, "ADD_TOURNAMENT_BOT_PLAYER");
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
  async addBot(
    botId: string,
    name: string,
    buyInCents: number,
    catalogBotId?: string,
    options?: AddBotOptions,
  ) {
    await this.enqueueSerializedStateMutation(async () => {
      if (process.env.POKER_INSTANT_GAME_DEBUG === "1") {
        logger.info(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            botId,
            inertDuringSeed: options?.inertDuringSeed === true,
            street: this.state.street,
            roundState: this.state.roundState,
            toActSeat: this.state.toActSeat,
          },
          "DEALER_ADD_BOT_BEFORE_PLANS",
        );
      }
      const plans = await this.playerLifecycleService.addBot(botId, name, buyInCents, catalogBotId, options);
      if (process.env.POKER_INSTANT_GAME_DEBUG === "1") {
        logger.info(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            botId,
            plans: plans.map((plan) => plan.kind),
            inertDuringSeed: options?.inertDuringSeed === true,
            street: this.state.street,
            roundState: this.state.roundState,
            toActSeat: this.state.toActSeat,
          },
          "DEALER_ADD_BOT_BEFORE_APPLY_PLANS",
        );
      }
      await this.applyExternalPlayerLifecyclePlans(plans, "ADD_BOT");
      if (process.env.POKER_INSTANT_GAME_DEBUG === "1") {
        logger.info(
          {
            tableId: this.state.tableId,
            handId: this.state.handId,
            botId,
            inertDuringSeed: options?.inertDuringSeed === true,
            street: this.state.street,
            roundState: this.state.roundState,
            toActSeat: this.state.toActSeat,
          },
          "DEALER_ADD_BOT_AFTER_APPLY_PLANS",
        );
      }
    });
  }

  async removeBot(botId: string) {
    await this.enqueueSerializedStateMutation(async () => {
      await this.removeBotInternal(botId);
    });
  }

  async removePlayer(userId: string, options?: { cashOutAfterRemoval?: boolean }) {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.removePlayer(userId, options);
      await this.applyExternalPlayerLifecyclePlans(plans, "REMOVE_PLAYER");
    });
  }

  /** Add chips to seated player (rebuy). Ledger must already be updated via economy buy-in. */
  async applyRebuy(userId: string, amountCents: number, rebuyRef?: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.addChipsToSeatedPlayer(userId, amountCents, rebuyRef);
      await this.applyExternalPlayerLifecyclePlans(plans, "APPLY_REBUY");
    });
  }

  async handleConsentedLeave(userId: string) {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.removePlayer(userId, { cashOutAfterRemoval: true });
      await this.applyExternalPlayerLifecyclePlans(plans, "HANDLE_CONSENTED_LEAVE");
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
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        userId,
        disconnectDeadlineTs,
        nextStepOwner: this.nextStepOwner,
        queueDepth: this.getQueueDepth(),
        currentQueueItem: this.getCurrentQueueItem(),
        lastQueueTransition: this.getLastQueueTransition(),
      },
      "DISCONNECT_QUEUE_ENQUEUE",
    );
    await this.enqueueSerializedStateMutation(async () => {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          userId,
          disconnectDeadlineTs,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          currentQueueItem: this.getCurrentQueueItem(),
          lastQueueTransition: this.getLastQueueTransition(),
        },
        "DISCONNECT_QUEUE_START",
      );
      const plans = this.playerLifecycleService.markDisconnected(userId, disconnectDeadlineTs);
      this.stageExternalPlayerLifecyclePlans(plans, "MARK_DISCONNECTED");
      await this.requestDrive("MARK_DISCONNECTED");
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          userId,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          currentQueueItem: this.getCurrentQueueItem(),
          lastQueueTransition: this.getLastQueueTransition(),
        },
        "DISCONNECT_QUEUE_COMPLETE",
      );
    });
  }

  async markReconnectedSerialized(userId: string): Promise<void> {
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        userId,
        nextStepOwner: this.nextStepOwner,
        queueDepth: this.getQueueDepth(),
        currentQueueItem: this.getCurrentQueueItem(),
        lastQueueTransition: this.getLastQueueTransition(),
      },
      "RECONNECT_QUEUE_ENQUEUE",
    );
    await this.enqueueSerializedStateMutation(async () => {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          userId,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          currentQueueItem: this.getCurrentQueueItem(),
          lastQueueTransition: this.getLastQueueTransition(),
        },
        "RECONNECT_QUEUE_START",
      );
      const plans = this.playerLifecycleService.markReconnected(userId);
      this.stageExternalPlayerLifecyclePlans(plans, "MARK_RECONNECTED");
      await this.requestDrive("MARK_RECONNECTED");
      await this.snapshotService.emitToUser(userId, "RECONNECT");
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          userId,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          currentQueueItem: this.getCurrentQueueItem(),
          lastQueueTransition: this.getLastQueueTransition(),
        },
        "RECONNECT_QUEUE_COMPLETE",
      );
    });
  }

  async markAbandonedSerialized(userId: string): Promise<void> {
    await this.enqueueSerializedStateMutation(async () => {
      const plans = await this.playerLifecycleService.markAbandoned(userId);
      this.stageExternalPlayerLifecyclePlans(plans, "MARK_ABANDONED");
      await this.requestDrive("MARK_ABANDONED");
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
  private lastRoundClosedSelfHealLogAt = 0;
  private lastRoundClosedSelfHealKey = "";
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
  private scheduleHumanTurnTimeout(userId: string): boolean {
    this.lastDriveMarker = `schedule_human_turn_timeout:before:${userId}`;
    const armed = this.turnManager.scheduleHumanTurnTimeout(userId);
    this.lastDriveMarker = `schedule_human_turn_timeout:after:${userId}:${armed ? "armed" : "skipped"}`;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        toActSeat: this.state.toActSeat,
        userId,
        armed,
        turnDeadlineMs: this.state.turnDeadlineMs,
        nextStepOwner: this.nextStepOwner,
      },
      "SCHEDULE_HUMAN_TURN_TIMEOUT_RESULT",
    );
    // if (armed) {
    //   this.setNextStepOwner("WAITING_FOR_HUMAN", "SCHEDULE_HUMAN_TURN_TIMEOUT");
    // }
    return armed;
  }

  /**
   * Ensure an actionable connected human always has a running server-side turn timer.
   * This is called from the common next-actor resolution path so timer arming cannot
   * be skipped by a missed automation/redrive step.
   */
  private ensureHumanTurnTimerForCurrentActor(trigger: string): void {
    this.lastDriveMarker = `ensure_human_turn_timer:enter:${trigger}`;
    if (
      this.state.street === "WAITING" ||
      this.state.street === "SHOWDOWN" ||
      this.state.runoutMode === "STAGED" ||
      this.state.roundState === "HAND_COMPLETE" ||
      this.state.roundState === "RUNOUT"
    ) {
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
    const actionableRound = this.repairCurrentToActNeedsActionIfNeeded(trigger);
    if (!toActPlayer.needsAction) {
      if (!actionableRound) {
        this.clearPendingHumanTurnTimeout();
        return;
      }
      this.clearPendingHumanTurnTimeout();
      return;
    }

    if (toActPlayer.kind !== "HUMAN" || !toActPlayer.connected) {
      this.clearPendingHumanTurnTimeout();
      return;
    }

    const beforeTurnStartTs = this.turnManager.getTurnStartTs();
    const armed = this.scheduleHumanTurnTimeout(toActUserId);
    const afterTurnStartTs = this.turnManager.getTurnStartTs();
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        trigger,
        toActSeat: this.state.toActSeat,
        toActUserId,
        connected: toActPlayer.connected,
        armed,
        beforeTurnStartTs,
        afterTurnStartTs,
        turnDeadlineMs: this.state.turnDeadlineMs,
        nextStepOwner: this.nextStepOwner,
      },
      "ENSURE_HUMAN_TURN_TIMER_RESULT",
    );
    if (armed && afterTurnStartTs > 0 && afterTurnStartTs !== beforeTurnStartTs) {
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

  private maybeSelfHealInvalidToActSeat(trigger: string): void {
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    if (this.state.runoutMode === "STAGED") return;
    if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) return;

    const currentSeat = this.state.toActSeat;
    const toActUserId = currentSeat >= 0 ? (this.state.seats[currentSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    const invalidToAct = !toActPlayer || !eligibleToAct(toActPlayer) || !toActPlayer.needsAction;
    if (!invalidToAct) return;

    const pivot = currentSeat >= 0
      ? currentSeat
      : (this.state.dealerSeat >= 0 ? this.state.dealerSeat : 0);
    const repairedSeat = findNextToActSeat(this.state, pivot);
    if (repairedSeat < 0 || repairedSeat === currentSeat) return;

    const repairedUserId = this.state.seats[repairedSeat] ?? "";
    logger.error(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        trigger,
        toActSeatBefore: currentSeat,
        toActUserIdBefore: toActUserId,
        toActSeatAfter: repairedSeat,
        toActUserIdAfter: repairedUserId,
      },
      "TO_ACT_INVALID_REPAIRED",
    );
    this.assignToActSeatWithTrace(repairedSeat, "SELF_HEAL_INVALID_TO_ACT_SEAT");
  }

  private maybeSelfHealRoundClosedNoAction(trigger: string): void {
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    if (this.state.runoutMode === "STAGED") return;
    if (!bettingRoundComplete(this.state) && !noFurtherBettingPossible(this.state)) return;

    const key = `${this.state.handId}|${this.state.street}|${this.state.handActionSeq}`;
    const now = Date.now();
    if (
      key !== this.lastRoundClosedSelfHealKey ||
      now - this.lastRoundClosedSelfHealLogAt > 5000
    ) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          handActionSeq: this.state.handActionSeq,
          trigger,
        },
        "ROUND_CLOSED_SELF_HEAL_ADVANCE_REQUESTED",
      );
      this.lastRoundClosedSelfHealKey = key;
      this.lastRoundClosedSelfHealLogAt = now;
    }

    void this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:ROUND_CLOSED_SELF_HEAL");
  }

  private onWaitingForActionEntered(reason: string): void {
    void this.requestDrive(`ROUND_STATE_ENTER:${reason}`);
  }

  handleAction(userId: string, msg: ActionPayload, actionId?: string, actorClient?: Client): Promise<void> {
    return this.actionOrchestrator.handleAction(userId, msg, actionId, actorClient);
  }

  // Legacy test compatibility shim.
  async recordAcceptedPayout(playerId: string, amountCents: number): Promise<void> {
    await this.settlementService.recordAcceptedPayout(playerId, amountCents);
  }

  // ---------------------------------------------------------------------------
  // ACTION HANDLING - PRIVATE IMPLEMENTATION
  // ---------------------------------------------------------------------------
  // Core action execution, result application, and preflop statistics

  private _handleAction(
    userId: string,
    msg: ActionPayload,
    origin: TableLastAction["origin"],
    actionId?: string,
  ): Promise<void> {
    return this.actionOrchestrator.handleInternalAction(userId, msg, origin, actionId);
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

  private recordLastAcceptedActionSnapshot(args: {
    handId: string;
    userId: string;
    action: string;
    amountCents: number | null;
  }): void {
    this.lastAcceptedActionSnapshotByHandId.set(args.handId, {
      handId: args.handId,
      userId: args.userId,
      action: args.action,
      amountCents: args.amountCents,
      resultingToActSeat: this.state.toActSeat,
      resultingRoundState: this.state.roundState,
      resultingStreet: this.state.street,
      resultingResolvedActionId: this.resolvedActionId,
      lastAction: this.currentHand?.lastAction ?? null,
    });
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
    this.resolvedActionId = undefined;
    this.state.toActSeat = -1;
    for (const p of this.state.playersById.values()) {
      p.needsAction = false;
    }
    this.setNextStepOwner("IDLE", "TRANSITION_TO_WAITING");
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
      return resolvePlayersReadyForNextHand(this.state).length >= 2 ? "START_NEXT_HAND" : "NO_OP";
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
      startNextHandDue: () => this.state.street === "WAITING" && resolvePlayersReadyForNextHand(this.state).length >= 2,
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
    const payload = this.buildEngineDecisionLogPayload(reason, now);
    this.lastDecisionTraceId = payload.decisionTraceId;
    logger.info(payload, "ENGINE_DECISION");
  }

  private logEngineDecisionAndRuntimeStep(reason: string, now?: number): void {
    if (!this.shouldLogEngineDecision()) return;
    const payload = this.buildEngineDecisionLogPayload(reason, now);
    this.lastDecisionTraceId = payload.decisionTraceId;
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

  getLastDecisionTraceIdPublic(): string | null {
    return this.lastDecisionTraceId;
  }

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE MANAGEMENT
  // ---------------------------------------------------------------------------
  // Hand initiation, street progression, and completion scenarios

  private async startHand() {
    logger.info({
      handId: this.state.handId,
      street: this.state.street,
      toActSeat: this.state.toActSeat,
      resolvedActionId: this.resolvedActionId,
      runoutMode: this.state.runoutMode,
      roundState: this.state.roundState,
      nextStepOwner: this.nextStepOwner,
      driveInProgress: this.driveInProgress,
      activeTerminalLifecycle: this.activeTerminalLifecycle,
      completedTerminalLifecycle: this.completedTerminalLifecycle,
      queueDepth: this.turnManager.getQueueDepth(),
      reason: "START_HAND_TOP"
    }, "DEBUG_START_HAND_STATE");

    if (!this.driveInProgress) {
      await this.requestDrive("START_HAND:EXTERNAL_ENTRY");
      return;
    }
    this.resolvedActionId = undefined;
    this.state.toActSeat = -1;
    this.activeTerminalLifecycle = null;
    this.completedTerminalLifecycle = null;
    this.setNextStepOwner("RUNNING_LIFECYCLE", "START_HAND");
    await this.handOrchestrator.startHand();
    dealerRuntimeMetrics.recordHandStarted();
    this.logEngineDecisionAndRuntimeStep("START_HAND");
  }

  private async advanceStreetOrShowdown(caller = "ADVANCE_STREET_OR_SHOWDOWN") {
    if (!this.driveInProgress) {
      await this.requestDrive(`ADVANCE_STREET_OR_SHOWDOWN:EXTERNAL_ENTRY:${caller}`);
      return;
    }
    this.setNextStepOwner("RUNNING_LIFECYCLE", "ADVANCE_STREET_OR_SHOWDOWN");
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        caller,
      },
      "TERMINAL_LIFECYCLE_CALLER",
    );
    await this.handOrchestrator.advanceStreetOrShowdown();
    this.logEngineDecisionAndRuntimeStep("ADVANCE_STREET_OR_SHOWDOWN");
  }

  private async finishHandByLastStanding(caller = "FINISH_HAND_LAST_STANDING") {
    if (!this.driveInProgress) {
      await this.requestDrive(`FINISH_HAND_LAST_STANDING:EXTERNAL_ENTRY:${caller}`);
      return;
    }
    const handId = this.state.handId;
    if (!handId) {
      await this.handOrchestrator.finishHandByLastStanding();
      this.logEngineDecisionAndRuntimeStep("FINISH_HAND_LAST_STANDING");
      return;
    }
    logger.info(
      {
        tableId: this.state.tableId,
        handId,
        street: this.state.street,
        roundState: this.state.roundState,
        caller,
      },
      "TERMINAL_ENTER",
    );
    if (this.activeTerminalLifecycle?.handId === handId) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId,
          street: this.state.street,
          roundState: this.state.roundState,
          caller,
          existingPath: this.activeTerminalLifecycle.path,
          existingCaller: this.activeTerminalLifecycle.caller,
        },
        "TERMINAL_LIFECYCLE_DUPLICATE_IN_FLIGHT",
      );
      return;
    }
    if (this.completedTerminalLifecycle?.handId === handId) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId,
          street: this.state.street,
          roundState: this.state.roundState,
          caller,
          existingPath: this.completedTerminalLifecycle.path,
          existingCaller: this.completedTerminalLifecycle.caller,
        },
        "TERMINAL_LIFECYCLE_DUPLICATE_COMPLETED",
      );
      return;
    }
    this.activeTerminalLifecycle = { handId, path: "LAST_STANDING", caller };
    logger.info(
      {
        tableId: this.state.tableId,
        handId,
        trigger: caller,
        path: "LAST_STANDING",
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        potCents: this.state.potCents,
        activeTerminalLifecycle: this.activeTerminalLifecycle,
        completedTerminalLifecycle: this.completedTerminalLifecycle,
      },
      "TERMINAL_PATH_SELECTED",
    );
    try {
      await this.handOrchestrator.finishHandByLastStanding();
      this.completedTerminalLifecycle = { handId, path: "LAST_STANDING", caller };
    } finally {
      if (this.activeTerminalLifecycle?.handId === handId) {
        logger.info(
          {
            tableId: this.state.tableId,
            handId,
            path: "LAST_STANDING",
            street: this.state.street,
            roundState: this.state.roundState,
            toActSeat: this.state.toActSeat,
            potCents: this.state.potCents,
            activeTerminalLifecycle: this.activeTerminalLifecycle,
            completedTerminalLifecycle: this.completedTerminalLifecycle,
          },
          "TERMINAL_EXIT",
        );
        this.activeTerminalLifecycle = null;
      }
    }
    this.logEngineDecisionAndRuntimeStep("FINISH_HAND_LAST_STANDING");
  }
  private async finishHandShowdownWithSidePots(caller = "FINISH_HAND_SHOWDOWN") {
    if (!this.driveInProgress) {
      await this.requestDrive(`FINISH_HAND_SHOWDOWN:EXTERNAL_ENTRY:${caller}`);
      return;
    }
    const handId = this.state.handId;
    if (!handId) {
      await this.handOrchestrator.finishHandShowdownWithSidePots();
      this.logEngineDecisionAndRuntimeStep("FINISH_HAND_SHOWDOWN");
      return;
    }
    logger.info(
      {
        tableId: this.state.tableId,
        handId,
        street: this.state.street,
        roundState: this.state.roundState,
        caller,
      },
      "TERMINAL_ENTER",
    );
    if (this.activeTerminalLifecycle?.handId === handId) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId,
          street: this.state.street,
          roundState: this.state.roundState,
          caller,
          existingPath: this.activeTerminalLifecycle.path,
          existingCaller: this.activeTerminalLifecycle.caller,
        },
        "TERMINAL_LIFECYCLE_DUPLICATE_IN_FLIGHT",
      );
      return;
    }
    if (this.completedTerminalLifecycle?.handId === handId) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId,
          street: this.state.street,
          roundState: this.state.roundState,
          caller,
          existingPath: this.completedTerminalLifecycle.path,
          existingCaller: this.completedTerminalLifecycle.caller,
        },
        "TERMINAL_LIFECYCLE_DUPLICATE_COMPLETED",
      );
      return;
    }
    this.activeTerminalLifecycle = { handId, path: "SHOWDOWN", caller };
    logger.info(
      {
        tableId: this.state.tableId,
        handId,
        trigger: caller,
        path: "SHOWDOWN",
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        potCents: this.state.potCents,
        activeTerminalLifecycle: this.activeTerminalLifecycle,
        completedTerminalLifecycle: this.completedTerminalLifecycle,
      },
      "TERMINAL_PATH_SELECTED",
    );
    try {
      await this.handOrchestrator.finishHandShowdownWithSidePots();
      this.completedTerminalLifecycle = { handId, path: "SHOWDOWN", caller };
    } finally {
      if (this.activeTerminalLifecycle?.handId === handId) {
        logger.info(
          {
            tableId: this.state.tableId,
            handId,
            path: "SHOWDOWN",
            street: this.state.street,
            roundState: this.state.roundState,
            toActSeat: this.state.toActSeat,
            potCents: this.state.potCents,
            activeTerminalLifecycle: this.activeTerminalLifecycle,
            completedTerminalLifecycle: this.completedTerminalLifecycle,
          },
          "TERMINAL_EXIT",
        );
        this.activeTerminalLifecycle = null;
      }
    }
    this.logEngineDecisionAndRuntimeStep("FINISH_HAND_SHOWDOWN");
  }

  /**
   * Single authoritative progression function.
   *
   * Reads current state and determines exactly what to do next — no caller knowledge required.
   * Every path that changes game state (action accepted, lifecycle plan complete, timeout fired,
   * stall recovery) routes here. driveGame() runs until the next *external* event is needed:
   *   - human action       → arm human timeout and return
   *   - bot timer          → schedule bot action and return
   *   - next-hand timer    → scheduleNextHand() called by lifecycle plans and return
   *
   * The serialized action queue owns concurrency safety; driveGame() owns progression.
   */
  private async driveGame(trigger: string): Promise<void> {
    if (this.driveInProgress) {
      this.driveQueued = true;
      this.driveQueuedReason = trigger;
      await this.drivePromise;
      return;
    }

    this.driveInProgress = true;
    this.drivePromise = (async () => {
      let currentTrigger = trigger;
      try {
        do {
          this.driveQueued = false;
          this.driveQueuedReason = "";
          await this.driveGameOnce(currentTrigger);
          currentTrigger = this.driveQueuedReason || currentTrigger;
        } while (!this.disposed && this.driveQueued);
      } finally {
        this.driveInProgress = false;
        this.driveQueuedReason = "";
        this.drivePromise = null;
      }
    })();

    await this.drivePromise;
  }

  private async driveGameOnce(trigger: string): Promise<void> {
    if (this.disposed) return;

    const driveNow = Date.now();
    const mark = (marker: string): void => {
      this.lastDriveMarker = marker;
    };
    const runChecks = (t: string): void => {
      // maybeSelfHealRoundClosedNoAction intentionally omitted: driveGame() only
      // reaches this path when bettingRoundComplete is false, so self-heal
      // guard would return immediately. advanceStreetOrShowdown() is called directly
      // above when betting is closed.
      mark("runChecks:before_self_heal_invalid");
      this.maybeSelfHealInvalidToActSeat(t);
      mark("runChecks:after_self_heal_invalid");
      mark("runChecks:before_ensure_human_timer");
      this.ensureHumanTurnTimerForCurrentActor(t);
      mark("runChecks:after_ensure_human_timer");
      mark("runChecks:before_self_heal_waiting_human");
      this.maybeSelfHealWaitingHumanWithoutDeadline(t);
      mark("runChecks:after_self_heal_waiting_human");
      if (this.state.roundState === "WAITING_FOR_ACTION" && this.state.toActSeat >= 0) {
        const toActPlayer = [...this.state.playersById.values()].find((player) => player.seat === this.state.toActSeat);
        if (toActPlayer && !toActPlayer.needsAction) {
          logger.error(
            {
              tableId: this.state.tableId,
              handId: this.state.handId,
              street: this.state.street,
              toActSeat: this.state.toActSeat,
              toActUserId: toActPlayer.id,
              trigger: t,
              lastMarker: this.lastDriveMarker,
            },
            "INVALID_ACTOR_STATE",
          );
        }
      }
      mark("runChecks:before_log_engine_decision_state");
      this.logEngineDecisionState(t);
      mark("runChecks:after_log_engine_decision_state");
      mark("runChecks:before_log_to_act_derivation_warning");
      this.logToActDerivationWarning(t);
      mark("runChecks:after_log_to_act_derivation_warning");
      mark("runChecks:before_log_runtime_step");
      this.logEngineDecisionAndRuntimeStep(t, driveNow);
      mark("runChecks:after_log_runtime_step");
    };

    try {
      mark("drive:before_flush_external_player_lifecycle_batches");
      await this.flushExternalPlayerLifecycleBatches();
      mark("drive:after_flush_external_player_lifecycle_batches");
      if (this.state.roundState === "WAITING_FOR_ACTION") {
        const toActUserId =
          this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
        const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
        if (
          toActPlayer &&
          eligibleToAct(toActPlayer) &&
          toActPlayer.needsAction &&
          this.getQueueDepth() === 0
        ) {
          logger.error(
            {
              tableId: this.state.tableId,
              handId: this.state.handId,
              street: this.state.street,
              toActSeat: this.state.toActSeat,
              toActUserId,
              nextStepOwner: this.nextStepOwner,
              queueDepth: this.getQueueDepth(),
              pendingSeatReleases: this.pendingSeatReleaseUserIds.size,
              lastMarker: this.lastDriveMarker,
            },
            "FLUSH_RETURNED_WITH_ACTIONABLE_IDLE_STATE",
          );
        }
      }

      // 🔥 CANONICAL LOOP: Continue driving until no more work exists
      let safety = 0;
      let terminalLifecycleCompletedThisDrive = false;
      while (safety++ < 100) {
        mark("loop:top");
        const street = this.state.street;
        let madeProgress = false;

        // WAITING: between-hands timer running or not enough players.
        if (street === "WAITING") {
          mark("loop:waiting_branch");
          if (this.activeTerminalLifecycle) break;
          if (terminalLifecycleCompletedThisDrive) break;

          // 🔥 CRITICAL: Use same eligibility logic as startHand() to avoid mismatch
          const activePlayers = resolvePlayersReadyForNextHand(this.state);
          
          // 🔴 SETTLEMENT BARRIER: Don't start new hand while previous hand still settling
          const completedTerminalLifecycleId = this.completedTerminalLifecycle?.handId ?? null;
          const handStillSettling = completedTerminalLifecycleId === this.state.handId;
          
          if (handStillSettling) {
            logger.info({
              handId: this.state.handId,
              activeTerminalLifecycle: null,
              completedTerminalLifecycle: completedTerminalLifecycleId,
              reason: "HAND_STILL_SETTLING"
            }, "WAITING_HAND_SETTLEMENT_BARRIER");
            break; // 🔴 DO NOT START NEW HAND YET
          }

          if (this.pendingSeatReleaseUserIds.size > 0) {
            mark("loop:waiting_before_release_pending_seats");
            await this.releasePendingSeats();
            mark("loop:waiting_after_release_pending_seats");
            madeProgress = true;
            continue;
          }

          if (this.onTournamentWaitingAfterHand) {
            mark("loop:waiting_tournament_reconcile");
            await this.onTournamentWaitingAfterHand();
            mark("loop:waiting_tournament_reconcile_done");
            madeProgress = true;
          }

          if (this.isNextHandBlocked?.()) {
            break;
          }
          
          if (this.state.nextHandAtTs === 0 && activePlayers.length >= 2) {
            logger.info({
              handId: this.state.handId,
              street: this.state.street,
              toActSeat: this.state.toActSeat,
              resolvedActionId: this.resolvedActionId,
              runoutMode: this.state.runoutMode,
              roundState: this.state.roundState,
              nextStepOwner: this.nextStepOwner,
              driveInProgress: this.driveInProgress,
              activeTerminalLifecycle: this.activeTerminalLifecycle,
              completedTerminalLifecycle: this.completedTerminalLifecycle,
              queueDepth: this.turnManager.getQueueDepth(),
              reason: "BEFORE_START_HAND_CALL"
            }, "DEBUG_START_HAND_STATE");
            
            mark("loop:waiting_before_start_hand");
            await this.startHand();
            mark("loop:waiting_after_start_hand");
            madeProgress = true;
            continue;
          } else {
            break; // No work to do in WAITING (timer running or not enough eligible players)
          }
        } else if (this.state.roundState === "HAND_COMPLETE") {
          mark("loop:hand_complete_branch");
          this.normalizeTerminalRoundState(`DRIVE_GAME:${trigger}:HAND_COMPLETE`);
          if (
            this.activeTerminalLifecycle?.handId === this.state.handId ||
            this.completedTerminalLifecycle?.handId === this.state.handId
          ) {
            break; // Terminal lifecycle already in flight
          }

          if (countNotFoldedPlayers(this.state) <= 1) {
            mark("loop:hand_complete_before_finish_last_standing");
            await this.finishHandByLastStanding(`DRIVE_GAME:${trigger}:ROUND_STATE_HAND_COMPLETE_LAST_PLAYER`);
            mark("loop:hand_complete_after_finish_last_standing");
            madeProgress = true;
            if (this.state.street === "WAITING") {
              terminalLifecycleCompletedThisDrive = true;
            }
            continue;
          } else {
            mark("loop:hand_complete_before_finish_showdown");
            await this.finishHandShowdownWithSidePots(`DRIVE_GAME:${trigger}:ROUND_STATE_HAND_COMPLETE_SHOWDOWN`);
            mark("loop:hand_complete_after_finish_showdown");
            madeProgress = true;
            if (this.state.street === "WAITING") {
              terminalLifecycleCompletedThisDrive = true;
            }
            continue;
          }
        } else if (this.state.roundState === "RUNOUT") {
          mark("loop:runout_branch");
          this.normalizeTerminalRoundState(`DRIVE_GAME:${trigger}:RUNOUT`);
          if (
            this.activeTerminalLifecycle?.handId === this.state.handId ||
            this.completedTerminalLifecycle?.handId === this.state.handId
          ) {
            break; // Terminal lifecycle already in flight
          }

          mark("loop:runout_before_advance_street_or_showdown");
          await this.advanceStreetOrShowdown(`DRIVE_GAME:${trigger}:ROUND_STATE_RUNOUT`);
          mark("loop:runout_after_advance_street_or_showdown");
          madeProgress = true;
          terminalLifecycleCompletedThisDrive = terminalLifecycleCompletedThisDrive || this.state.street === "WAITING";
          continue;
        } else if (countNotFoldedPlayers(this.state) <= 1) {
          mark("loop:last_player_before_finish_last_standing");
          await this.finishHandByLastStanding(`DRIVE_GAME:${trigger}:LAST_PLAYER_STANDING`);
          mark("loop:last_player_after_finish_last_standing");
          madeProgress = true;
          if (this.state.street === "WAITING") {
            terminalLifecycleCompletedThisDrive = true;
          }
          continue;
        } else if (
          street === "SHOWDOWN" ||
          this.state.runoutMode === "STAGED" ||
          allRemainingPlayersAllInOrFolded(this.state)
        ) {
          mark("loop:showdown_or_runout_before_advance");
          await this.advanceStreetOrShowdown(`DRIVE_GAME:${trigger}:SHOWDOWN_OR_RUNOUT`);
          mark("loop:showdown_or_runout_after_advance");
          madeProgress = true;
          terminalLifecycleCompletedThisDrive = terminalLifecycleCompletedThisDrive || this.state.street === "WAITING";
          continue;
        } else if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
          mark("loop:betting_closed_before_advance");
          await this.advanceStreetOrShowdown(`DRIVE_GAME:${trigger}:BETTING_CLOSED`);
          mark("loop:betting_closed_after_advance");
          madeProgress = true;
          terminalLifecycleCompletedThisDrive = terminalLifecycleCompletedThisDrive || this.state.street === "WAITING";
          continue;
        } else {
          // Active betting: schedule the next actor (bot, disconnected human, or arm human timer).
          mark("loop:active_betting_before_maybe_act_for_bot");
          this.maybeActForBot();
          mark("loop:active_betting_after_maybe_act_for_bot");
          break; // Wait for automation or human action
        }

        // If no progress was made in this iteration, stop to prevent infinite loop
        if (!madeProgress) break;
      }

      if (safety >= 100) {
        logger.error(
          { tableId: this.state.tableId, handId: this.state.handId, lastMarker: this.lastDriveMarker },
          "DRIVE_GAME_SAFETY_LIMIT_EXCEEDED",
        );
      }

      mark("drive:before_run_checks");
      runChecks(trigger);
      mark("drive:after_run_checks");
      if (this.state.roundState === "WAITING_FOR_ACTION") {
        const toActUserId =
          this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
        const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
        if (
          toActPlayer &&
          eligibleToAct(toActPlayer) &&
          toActPlayer.needsAction &&
          this.getQueueDepth() === 0
        ) {
          logger.error(
            {
              tableId: this.state.tableId,
              handId: this.state.handId,
              street: this.state.street,
              trigger,
              toActSeat: this.state.toActSeat,
              toActUserId,
              actorKind: toActPlayer.kind,
              connected: toActPlayer.connected,
              turnDeadlineMs: this.state.turnDeadlineMs,
              nextStepOwner: this.nextStepOwner,
              shouldWaitForHuman: toActPlayer.kind === "HUMAN" && toActPlayer.connected,
              shouldWaitForAutomation: toActPlayer.kind !== "HUMAN" || !toActPlayer.connected,
              queueDepth: this.getQueueDepth(),
              pendingSeatReleases: this.pendingSeatReleaseUserIds.size,
              lastMarker: this.lastDriveMarker,
            },
            "POST_RUNCHECKS_ACTIONABLE_IDLE_STATE",
          );
          if (toActPlayer.kind === "HUMAN" && toActPlayer.connected && this.state.turnDeadlineMs <= 0) {
            logger.error(
              {
                tableId: this.state.tableId,
                handId: this.state.handId,
                street: this.state.street,
                trigger,
                toActSeat: this.state.toActSeat,
                toActUserId,
                nextStepOwner: this.nextStepOwner,
                queueDepth: this.getQueueDepth(),
                lastMarker: this.lastDriveMarker,
              },
              "POST_RUNCHECKS_CONNECTED_HUMAN_WITHOUT_DEADLINE",
            );
          }
        }
      }
    } catch (err) {
      logger.error(
        {
          err,
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          trigger,
          lastMarker: this.lastDriveMarker,
        },
        "DRIVE_GAME_FAILED",
      );
    }
  }

  private repairCurrentToActNeedsActionIfNeeded(trigger: string): boolean {
    if (
      this.state.roundState !== "WAITING_FOR_ACTION" ||
      this.state.street === "WAITING" ||
      this.state.street === "SHOWDOWN" ||
      this.state.runoutMode === "STAGED" ||
      this.state.toActSeat < 0
    ) {
      return false;
    }

    const actionableRound =
      !bettingRoundComplete(this.state) &&
      !noFurtherBettingPossible(this.state);
    if (!actionableRound) return false;

    const toActUserId = this.state.seats[this.state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || !eligibleToAct(toActPlayer) || toActPlayer.needsAction) {
      return actionableRound;
    }

    const failFast = process.env.POKER_FAIL_FAST_INVARIANTS === "1";
    if (failFast) {
      throw new PokerError(
        "BAD_STATE",
        `WAITING actor does not require action: hand=${this.state.handId} seat=${this.state.toActSeat} street=${this.state.street}`,
      );
    }

    logger.error(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        userId: toActUserId,
        status: toActPlayer.status,
        needsActionBefore: toActPlayer.needsAction,
        roundBetCents: toActPlayer.roundBetCents,
        committedCents: toActPlayer.committedCents,
        trigger,
        resolvedActionId: this.resolvedActionId,
        lastAcceptedAction: this.getLastAcceptedActionSnapshot(this.state.handId),
      },
      "WAITING_ACTOR_NEEDS_ACTION_INVALID_REPAIRED",
    );
    toActPlayer.needsAction = true;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        userId: toActUserId,
        needsActionAfter: toActPlayer.needsAction,
        trigger,
      },
      "WAITING_ACTOR_NEEDS_ACTION_REPAIR_APPLIED",
    );
    return actionableRound;
  }

  /**
   * Thin wrapper kept for call-site compatibility during migration.
   * All routing logic has moved into driveGame(); this just delegates.
   */
  private requestDrive(reason: string): Promise<void> {
    return this.driveGame(reason);
  }

  private queueDrive(reason: string): void {
    if (this.driveInProgress) {
      this.driveQueued = true;
      this.driveQueuedReason = reason;
      return;
    }
    void this.requestDrive(reason);
  }

  private stageExternalPlayerLifecyclePlans(plans: PlayerLifecyclePlan[], source: string): void {
    if (plans.length === 0) return;
    this.pendingExternalPlayerLifecycleBatches.push({ source, plans });
  }

  private async applyExternalPlayerLifecyclePlans(plans: PlayerLifecyclePlan[], source: string): Promise<void> {
    if (plans.length === 0) return;
    this.stageExternalPlayerLifecyclePlans(plans, source);
    if (this.gameplayTransitionSuppressionDepth > 0) {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          source,
          plans: plans.map((plan) => plan.kind),
          suppressionDepth: this.gameplayTransitionSuppressionDepth,
        },
        "GAMEPLAY_TRANSITIONS_SUPPRESSED",
      );
      return;
    }
    await this.requestDrive(source);
  }

  private async flushExternalPlayerLifecycleBatches(): Promise<void> {
    this.lastDriveMarker = "flush:enter";
    while (this.pendingExternalPlayerLifecycleBatches.length > 0) {
      this.lastDriveMarker = "flush:before_shift";
      const batch = this.pendingExternalPlayerLifecycleBatches.shift();
      if (!batch) break;
      this.lastDriveMarker = `flush:after_shift:${batch.source}`;
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          toActSeat: this.state.toActSeat,
          source: batch.source,
          planKinds: batch.plans.map((plan) => plan.kind),
          remainingBatchCount: this.pendingExternalPlayerLifecycleBatches.length,
        },
        "FLUSH_EXTERNAL_PLAYER_LIFECYCLE_BATCH",
      );
      this.lastDriveMarker = `flush:before_execute:${batch.source}`;
      await this.executePlayerLifecyclePlans(batch.plans, `DRIVE:${batch.source}`);
      this.lastDriveMarker = `flush:after_execute:${batch.source}`;
    }
    this.lastDriveMarker = "flush:exit";
  }

  /**
   * Reconcile next-step ownership from observable state after a lifecycle batch.
   *
   * Important distinction:
   * - WAITING_FOR_HUMAN is only valid once a human deadline exists.
   * - WAITING_FOR_AUTOMATION is only valid once automation has already claimed ownership.
   *
   * If lifecycle leaves the hand active but without those scheduling side effects,
   * we deliberately fall back to RUNNING_LIFECYCLE so driveGame() can repair it.
   */
  private reconcileNextStepOwnerAfterLifecycle(trigger: string): void {
    let reconciledOwner: NextStepOwner;

    if (this.state.street === "WAITING") {
      reconciledOwner = this.state.nextHandAtTs > 0 ? "BETWEEN_HANDS" : "IDLE";
      this.setNextStepOwner(reconciledOwner, `RECONCILE_NEXT_STEP_OWNER:${trigger}`);
      return;
    }

    if (
      this.state.street === "SHOWDOWN" ||
      this.state.runoutMode === "STAGED" ||
      allRemainingPlayersAllInOrFolded(this.state) ||
      bettingRoundComplete(this.state) ||
      noFurtherBettingPossible(this.state)
    ) {
      reconciledOwner = "RUNNING_LIFECYCLE";
      this.setNextStepOwner(reconciledOwner, `RECONCILE_NEXT_STEP_OWNER:${trigger}`);
      return;
    }

    const toActUserId =
      this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;

    if (!toActPlayer || !eligibleToAct(toActPlayer) || !toActPlayer.needsAction) {
      reconciledOwner = "RUNNING_LIFECYCLE";
      this.setNextStepOwner(reconciledOwner, `RECONCILE_NEXT_STEP_OWNER:${trigger}`);
      return;
    }

    if (toActPlayer.kind === "HUMAN" && toActPlayer.connected) {
      reconciledOwner = this.state.turnDeadlineMs > 0 ? "WAITING_FOR_HUMAN" : "RUNNING_LIFECYCLE";
      this.setNextStepOwner(reconciledOwner, `RECONCILE_NEXT_STEP_OWNER:${trigger}`);
      return;
    }

    reconciledOwner =
      this.nextStepOwner === "WAITING_FOR_AUTOMATION"
        ? "WAITING_FOR_AUTOMATION"
        : "RUNNING_LIFECYCLE";
    this.setNextStepOwner(reconciledOwner, `RECONCILE_NEXT_STEP_OWNER:${trigger}`);
  }

  // ---------------------------------------------------------------------------
  // PLAN EXECUTION ENGINE
  // ---------------------------------------------------------------------------
  // Execute lifecycle plans from various service layers

  private async executeHandLifecyclePlans(plans: HandLifecyclePlan[], source = "UNKNOWN"): Promise<void> {
    if (!this.driveInProgress) {
      logger.error(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          handActionSeq: this.state.handActionSeq,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          source,
          plans: plans.map((plan) => plan.kind),
        },
        "LIFECYCLE_CALLED_OUTSIDE_DRIVE",
      );
    }
    await this.lifecycleExecutor.executeHandLifecyclePlans(plans);
    this.ensureHumanTurnTimerForCurrentActor("POST_HAND_LIFECYCLE_RECONCILE");
    this.reconcileNextStepOwnerAfterLifecycle("HAND_LIFECYCLE_COMPLETE");
    this.tryClaimAutomationOwnershipAfterLifecycle("HAND_LIFECYCLE_COMPLETE");
    this.assertProgressionOwnershipInvariant("HAND_LIFECYCLE_COMPLETE");
    if (this.nextStepOwner === "RUNNING_LIFECYCLE") {
      if (this.driveInProgress) {
        this.queueDrive("POST_HAND_LIFECYCLE_ORPHANED");
      } else {
        await this.driveGame("POST_HAND_LIFECYCLE_ORPHANED");
        this.assertProgressionOwnershipInvariant("HAND_LIFECYCLE_COMPLETE:POST_DRIVE");
      }
    }
  }

  private async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[], source = "UNKNOWN"): Promise<void> {
    if (!this.driveInProgress) {
      logger.error(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          handActionSeq: this.state.handActionSeq,
          nextStepOwner: this.nextStepOwner,
          queueDepth: this.getQueueDepth(),
          source,
          plans: plans.map((plan) => plan.kind),
        },
        "LIFECYCLE_CALLED_OUTSIDE_DRIVE",
      );
    }
    this.lastDriveMarker = `player_lifecycle:before_executor:${source}`;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        toActSeat: this.state.toActSeat,
        source,
        planKinds: plans.map((plan) => plan.kind),
      },
      "PLAYER_LIFECYCLE_EXECUTOR_ENTER",
    );
    await this.lifecycleExecutor.executePlayerLifecyclePlans(plans);
    this.lastDriveMarker = `player_lifecycle:after_executor:${source}`;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        toActSeat: this.state.toActSeat,
        source,
        planKinds: plans.map((plan) => plan.kind),
        nextStepOwner: this.nextStepOwner,
        queueDepth: this.getQueueDepth(),
      },
      "PLAYER_LIFECYCLE_EXECUTOR_EXIT",
    );
    this.ensureHumanTurnTimerForCurrentActor("POST_PLAYER_LIFECYCLE_RECONCILE");
    this.reconcileNextStepOwnerAfterLifecycle("PLAYER_LIFECYCLE_COMPLETE");
    this.tryClaimAutomationOwnershipAfterLifecycle("PLAYER_LIFECYCLE_COMPLETE");
    this.assertProgressionOwnershipInvariant("PLAYER_LIFECYCLE_COMPLETE");
    if (this.nextStepOwner === "RUNNING_LIFECYCLE") {
      if (this.driveInProgress) {
        this.queueDrive("POST_PLAYER_LIFECYCLE_ORPHANED");
      } else {
        await this.driveGame("POST_PLAYER_LIFECYCLE_ORPHANED");
        this.assertProgressionOwnershipInvariant("PLAYER_LIFECYCLE_COMPLETE:POST_DRIVE");
      }
    }
  }

  private async runHandEndedAwards(
    plan: Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>
  ): Promise<void> {
    dealerRuntimeMetrics.recordHandCompleted();
    await this.handOrchestrator.runHandEndedAwards(plan);
  }

  private logLifecycleOwnershipLeakIfNeeded(
    scope: "hand" | "player",
    plan: HandLifecyclePlan["kind"] | PlayerLifecyclePlan["kind"],
    context: { tableId: string; handId: string; street: string },
  ): void {
    const currentQueueItem = this.getCurrentQueueItem();
    if (
      this.nextStepOwner !== "RUNNING_LIFECYCLE" ||
      this.getQueueDepth() !== 0 ||
      currentQueueItem != null
    ) {
      return;
    }

    const toActSeat = this.state.toActSeat;
    const toActUserId = toActSeat >= 0 ? (this.state.seats[toActSeat] ?? "") : "";
    const actor = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    logger.error(
      {
        ...context,
        scope,
        plan,
        roundState: this.state.roundState,
        toActSeat,
        toActUserId,
        actorKind: actor?.kind ?? null,
        actorConnected: actor?.connected ?? null,
        actorNeedsAction: actor?.needsAction ?? null,
        actorStatus: actor?.status ?? null,
        turnDeadlineMs: this.state.turnDeadlineMs,
        nextStepOwner: this.nextStepOwner,
        queueDepth: this.getQueueDepth(),
        currentQueueItem,
        lastQueueTransition: this.getLastQueueTransition(),
      },
      "LIFECYCLE_OWNERSHIP_LEAK",
    );
  }

  private tryClaimAutomationOwnershipAfterLifecycle(trigger: string): void {
    if (this.nextStepOwner !== "RUNNING_LIFECYCLE") return;
    if (this.state.street === "WAITING" || this.state.roundState === "HAND_COMPLETE" || this.state.runoutMode === "STAGED") {
      return;
    }

    const toActSeat = this.state.toActSeat;
    const toActUserId = toActSeat >= 0 ? (this.state.seats[toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || !eligibleToAct(toActPlayer) || !toActPlayer.needsAction) return;
    if (toActPlayer.kind === "HUMAN" && toActPlayer.connected) return;

    const beforeTransition = this.getLastQueueTransition() as
      | { phase?: string; item?: { id?: number; source?: string; handId?: string | null; toActUserIdAtEnqueue?: string | null } }
      | null;
    const beforeTransitionId = beforeTransition?.item?.id ?? null;

    this.maybeActForBot();

    const currentQueueItem = this.getCurrentQueueItem() as
      | { id?: number; source?: string; handId?: string | null; toActUserIdAtEnqueue?: string | null }
      | null;
    const lastQueueTransition = this.getLastQueueTransition() as
      | { phase?: string; item?: { id?: number; source?: string; handId?: string | null; toActUserIdAtEnqueue?: string | null } }
      | null;

    const matchesActor = (item: { source?: string; handId?: string | null; toActUserIdAtEnqueue?: string | null } | null | undefined): boolean =>
      item?.source === "queued_internal_work" &&
      item.handId === this.state.handId &&
      item.toActUserIdAtEnqueue === toActUserId;

    const automationClaimed =
      matchesActor(currentQueueItem) ||
      (
        lastQueueTransition?.phase === "enqueued" &&
        lastQueueTransition.item?.id !== beforeTransitionId &&
        matchesActor(lastQueueTransition.item)
      );

    if (!automationClaimed) return;

    this.setNextStepOwner("WAITING_FOR_AUTOMATION", `AUTOMATION_CLAIMED_AFTER_LIFECYCLE:${trigger}`);
  }

  private reconcileAutomationOwnershipAfterTurnAdvancedWithoutDrive(): void {
    if (this.nextStepOwner !== "WAITING_FOR_AUTOMATION") return;
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return;
    if (this.state.toActSeat < 0) return;

    const toActUserId = this.state.seats[this.state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || !eligibleToAct(toActPlayer) || !toActPlayer.needsAction) return;
    if (toActPlayer.kind !== "HUMAN" || !toActPlayer.connected) return;

    this.setNextStepOwner("WAITING_FOR_HUMAN", "TURN_ADVANCED:AUTOMATION_OWNER_RECONCILE");
    this.ensureHumanTurnTimerForCurrentActor("TURN_ADVANCED:AUTOMATION_OWNER_RECONCILE");
  }

  // ---------------------------------------------------------------------------
  // HAND LIFECYCLE HELPER METHODS
  // ---------------------------------------------------------------------------
  // Support functions for hand progression, seat management, and player removal

  private async ensureHandAdvancingAfterPlayerRemoval(removedSeat: number): Promise<void> {
    if (this.state.street === "WAITING") {
      if (resolvePlayersReadyForNextHand(this.state).length >= 2) await this.requestDrive("START_HAND:ENSURE_HAND_ADVANCE_WAITING");
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
        this.assignToActSeatWithTrace(nextSeat, "ENSURE_HAND_ADVANCE_REASSIGN_TO_ACT");
        this.requestDrive("MAYBE_ACT_FOR_BOT:ENSURE_HAND_ADVANCE:NO_ELIGIBLE_TO_ACT");
      }
    } else {
      this.requestDrive("MAYBE_ACT_FOR_BOT:ENSURE_HAND_ADVANCE:TO_ACT_ELIGIBLE");
    }
  }

  private scheduleNextHand(reason: string, delayMs = 0) {
    this.setNextStepOwner("BETWEEN_HANDS", `SCHEDULE_NEXT_HAND:${reason}`);
    this.handOrchestrator.scheduleNextHand(reason, delayMs);
  }

  private async releasePendingSeats() {
    if (this.state.street !== "WAITING") return;
    const nowTs = Date.now();
    const toRelease = [...this.pendingSeatReleaseUserIds];
    this.pendingSeatReleaseUserIds.clear();
    for (const userId of toRelease) {
      logger.info(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          toActSeat: this.state.toActSeat,
          potCents: this.state.potCents,
          activeTerminalLifecycle: this.activeTerminalLifecycle,
          completedTerminalLifecycle: this.completedTerminalLifecycle,
          userId,
        },
        "PENDING_REMOVAL_FLUSH",
      );
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
      const plans = await this.playerLifecycleService.finalizePendingRemoval(userId);
      await this.executePlayerLifecyclePlans(plans, "RELEASE_PENDING_SEATS");
    }
  }

  private async addPlayerInternal(userId: string, name: string, buyInCents: number): Promise<void> {
    const plans = await this.playerLifecycleService.addPlayer(userId, name, buyInCents);
    await this.applyExternalPlayerLifecyclePlans(plans, "ADD_PLAYER");
  }

  private async restorePlayerFromSessionInternal(
    userId: string,
    name: string,
    seat: number,
    stackCents: number,
    options?: { connected?: boolean; sittingOut?: boolean; reconnectTimeoutMs?: number },
  ): Promise<void> {
    const plans = await this.playerLifecycleService.restorePlayerFromSession(userId, name, seat, stackCents, options);
    await this.applyExternalPlayerLifecyclePlans(plans, "RESTORE_PLAYER_FROM_SESSION");
  }

  private async removeBotInternal(botId: string): Promise<void> {
    const plans = await this.playerLifecycleService.removeBot(botId);
    await this.applyExternalPlayerLifecyclePlans(plans, "REMOVE_BOT");
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
        // ❗ REMOVED: Let caller own progression
        // await this.requestDrive("FINISH_HAND_LAST_STANDING:SIT_OUT_LAST_PLAYER");
        return;
      }

      if (this.state.toActSeat === player.seat) {
        if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
          // ❗ REMOVED: Let caller own progression
          // await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:SIT_OUT_BETTING_CLOSED");
          return;
        }
        const nextSeat = findNextToActSeat(this.state, player.seat);
        if (nextSeat === -1) {
          // ❗ REMOVED: Let caller own progression
          // await this.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:SIT_OUT_NO_NEXT_SEAT");
          return;
        }
        this.assignToActSeatWithTrace(nextSeat, "SET_PLAYER_SITTING_OUT_REASSIGN_TO_ACT");
      }

      await this.sendTableSnapshotToAll("SEAT_CHANGE");
      // ❗ REMOVED: Let caller own progression
      // this.requestDrive("MAYBE_ACT_FOR_BOT:SIT_OUT_SEAT_CHANGE");
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
      if (resolvePlayersReadyForNextHand(this.state).length >= 2) {
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

  private applyActionResult(
    result: ActionResult,
    options?: { turnAdvancedReason?: SnapshotReason; requestDriveAfterTurnAdvanced?: boolean },
  ): Promise<void> {
    return this.actionOrchestrator.applyActionResult(result, options);
  }

  private async reconcilePostActionLifecycleIfNeeded(kind: "HAND_FINISHED" | "STREET_COMPLETE"): Promise<void> {
    if (this.state.street === "WAITING") return;

    if (kind === "HAND_FINISHED") {
      const handStillTerminal =
        this.state.roundState === "HAND_COMPLETE" ||
        countNotFoldedPlayers(this.state) <= 1 ||
        this.state.street === "SHOWDOWN" ||
        this.state.runoutMode === "STAGED";
      if (!handStillTerminal) return;

      logger.warn(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          toActSeat: this.state.toActSeat,
        },
        "POST_ACTION_HAND_FINISH_RECONCILE",
      );

      if (countNotFoldedPlayers(this.state) <= 1) {
        await this.finishHandByLastStanding("POST_ACTION_HAND_FINISH_RECONCILE");
      } else {
        await this.finishHandShowdownWithSidePots("POST_ACTION_HAND_FINISH_RECONCILE");
      }
      return;
    }

    const bettingStillClosed =
      bettingRoundComplete(this.state) ||
      noFurtherBettingPossible(this.state) ||
      this.state.runoutMode === "STAGED" ||
      this.state.street === "SHOWDOWN";
    if (!bettingStillClosed) return;

    logger.warn(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
      },
      "POST_ACTION_STREET_COMPLETE_RECONCILE",
    );
    await this.advanceStreetOrShowdown("POST_ACTION_STREET_COMPLETE_RECONCILE");
  }

  private logActionResolvedNextActor(): void {
    const beforeSeat = this.state.toActSeat;
    const beforeUserId = beforeSeat >= 0 ? (this.state.seats[beforeSeat] ?? "") : "";
    const beforePlayer = beforeUserId ? this.state.playersById.get(beforeUserId) : undefined;
    this.repairCurrentToActNeedsActionIfNeeded("ACTION_RESOLVED_NEXT_ACTOR");
    const afterSeat = this.state.toActSeat;
    const afterUserId = afterSeat >= 0 ? (this.state.seats[afterSeat] ?? "") : "";
    const afterPlayer = afterUserId ? this.state.playersById.get(afterUserId) : undefined;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeatBefore: beforeSeat,
        toActUserIdBefore: beforeUserId,
        needsActionBefore: beforePlayer?.needsAction ?? null,
        nextSeat: this.state.toActSeat,
        nextUserId: afterUserId,
        needsActionAfter: afterPlayer?.needsAction ?? null,
        resolvedActionId: this.resolvedActionId,
        lastAcceptedAction: this.getLastAcceptedActionSnapshot(this.state.handId),
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
        // Serialize recovery through the queue — driveGame() can mutate state.
        void this.enqueueSerializedStateMutation(() => this.driveGame("TURN_OWNER_INVARIANT_VIOLATION"));
      }
    }

    // Progression ownership invariant: after every action resolution, assert the
    // claimed nextStepOwner is consistent with observable state. Violations are
    // logged as errors (not throws) so they surface in observability without crashing.
    this.assertProgressionOwnershipInvariant("logActionResolvedNextActor");
  }

  /**
   * Asserts that `nextStepOwner` is consistent with actual game state.
   *
   * Valid combinations:
   *  - IDLE                  → street is WAITING or SHOWDOWN
   *  - BETWEEN_HANDS         → street is WAITING (next-hand timer running)
   *  - RUNNING_LIFECYCLE     → any street (transition in progress)
   *  - WAITING_FOR_HUMAN     → active street, toAct is a connected human with a deadline
   *  - WAITING_FOR_AUTOMATION → active street, toAct is a bot or disconnected human
   *
   * Observation only — never throws, never mutates state.
   */
  private assertProgressionOwnershipInvariant(trigger: string): void {
    this.diagnostics.assertProgressionOwnershipInvariant(trigger);
  }

  private logEngineDecisionState(trigger: string): void {
    this.diagnostics.logEngineDecisionState(trigger);
  }

  private logToActDerivationWarning(trigger: string): void {
    this.diagnostics.logToActDerivationWarning(trigger);
  }

  private assignToActSeatWithTrace(nextSeat: number, trigger: string): void {
    const previousSeat = this.state.toActSeat;
    const previousUserId = previousSeat >= 0 ? (this.state.seats[previousSeat] ?? "") : "";
    const previousPlayer = previousUserId ? this.state.playersById.get(previousUserId) : undefined;
    // CRITICAL: Prevent illegal assignment in WAITING state
    if (this.state.street === "WAITING") {
      logger.error(
        { 
          trigger, 
          tableId: this.state.tableId,
          handId: this.state.handId,
          nextSeat,
          currentToActSeat: this.state.toActSeat,
        },
        "ILLEGAL_TO_ACT_ASSIGNMENT_IN_WAITING"
      );
      return;
    }
    
    this.state.toActSeat = nextSeat;
    const toActUserId = nextSeat >= 0 ? (this.state.seats[nextSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    if (nextSeat >= 0) {
      if (toActPlayer) {
        toActPlayer.needsAction = true;
      }
    }
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        trigger,
        toActSeatBefore: previousSeat,
        toActUserIdBefore: previousUserId,
        needsActionBefore: previousPlayer?.needsAction ?? null,
        toActSeatAfter: nextSeat,
        toActUserIdAfter: toActUserId,
        needsActionAfter: toActPlayer?.needsAction ?? null,
        resolvedActionId: this.resolvedActionId,
        lastAcceptedAction: this.getLastAcceptedActionSnapshot(this.state.handId),
      },
      "DEALER_TO_ACT_ASSIGNMENT",
    );
    if (toActPlayer && !toActPlayer.needsAction) {
      logger.error(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          trigger,
          toActSeat: nextSeat,
          toActUserId,
          status: toActPlayer.status,
          resolvedActionId: this.resolvedActionId,
          lastAcceptedAction: this.getLastAcceptedActionSnapshot(this.state.handId),
        },
        "TO_ACT_ASSIGNED_TO_NON_ACTIONABLE_PLAYER",
      );
    }
    if (process.env.POKER_TRACE_TO_ACT_ASSIGNMENTS !== "1") return;
    if (nextSeat < 0) return;
    if (!toActPlayer || toActPlayer.needsAction) return;

    logger.error(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: nextSeat,
        toActUserId,
        status: toActPlayer.status,
        needsAction: toActPlayer.needsAction,
        roundBetCents: toActPlayer.roundBetCents,
        committedCents: toActPlayer.committedCents,
        trigger,
        stack: new Error("TO_ACT_ASSIGNMENT_TRACE").stack,
      },
      "TO_ACT_ASSIGNED_WITHOUT_NEEDS_ACTION",
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
    const toActUserId =
      this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    this.lastDriveMarker = `maybe_act_for_bot:before:${toActUserId || "none"}`;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        toActUserId,
        actorKind: toActPlayer?.kind ?? null,
        connected: toActPlayer?.connected ?? null,
        needsAction: toActPlayer?.needsAction ?? null,
        turnDeadlineMs: this.state.turnDeadlineMs,
        nextStepOwner: this.nextStepOwner,
      },
      "MAYBE_ACT_FOR_BOT_ENTER",
    );
    this.turnAutomationService.maybeActForBot();
    this.lastDriveMarker = `maybe_act_for_bot:after:${toActUserId || "none"}`;
  }

  private normalizeTerminalRoundState(trigger: string): void {
    this.clearPendingHumanTurnTimeout();
    for (const player of this.state.playersById.values()) {
      player.needsAction = false;
    }
    if (this.state.roundState === "HAND_COMPLETE") {
      const terminalAnchor = [...this.state.playersById.values()].find(
        (player) => player.status !== "FOLDED" && player.status !== "OUT" && player.status !== "ABANDONED",
      );
      this.state.toActSeat = terminalAnchor?.seat ?? -1;
    }
    this.state.turnDeadlineMs = 0;
    logger.warn(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        toActSeat: this.state.toActSeat,
        trigger,
      },
      "TERMINAL_ROUND_STATE_NORMALIZED",
    );
  }

  /**
   * Public surface for stall-recovery callers (e.g. PokerRoom stall monitor).
   * Delegates to the private maybeActForBot so the encapsulation boundary is clear.
   */
  maybeActForBotPublic(): void {
    void this.enqueueSerializedStateMutation(() => this.driveGame("STALL_MONITOR_RECOVERY"));
  }

  suspendGameplayTransitions(reason: string): void {
    this.gameplayTransitionSuppressionDepth += 1;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        reason,
        suppressionDepth: this.gameplayTransitionSuppressionDepth,
      },
      "GAMEPLAY_TRANSITIONS_SUSPENDED",
    );
  }

  resumeGameplayTransitions(reason: string): void {
    if (this.gameplayTransitionSuppressionDepth <= 0) {
      logger.warn(
        {
          tableId: this.state.tableId,
          handId: this.state.handId,
          street: this.state.street,
          roundState: this.state.roundState,
          reason,
        },
        "GAMEPLAY_TRANSITIONS_RESUME_WITHOUT_SUPPRESSION",
      );
      return;
    }

    this.gameplayTransitionSuppressionDepth -= 1;
    logger.info(
      {
        tableId: this.state.tableId,
        handId: this.state.handId,
        street: this.state.street,
        roundState: this.state.roundState,
        reason,
        suppressionDepth: this.gameplayTransitionSuppressionDepth,
      },
      "GAMEPLAY_TRANSITIONS_RESUMED",
    );
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
      this.assignToActSeatWithTrace(nextSeat, "DISCONNECTED_AUTO_ACTION_CAP");
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
    this.turnManager.dispose();
    this.clearPendingHumanTurnTimeout();
    this.disconnectManager.dispose();
    for (const timeoutId of this.pendingBotActionTimeoutIds) {
      clearTimeout(timeoutId);
    }
    this.pendingBotActionTimeoutIds.clear();
    this.clientsByUserId.clear();
    this.pendingSeatReleaseUserIds.clear();
    this.pendingExternalPlayerLifecycleBatches.length = 0;
    this.currentHand = null;
    this.lastHandResult = undefined;
    this.resolvedActionId = undefined;
    this.activeTerminalLifecycle = null;
    this.completedTerminalLifecycle = null;
    this.autoActionsByUserId.clear();
    this.currentHandAutoActedUserIds.clear();
    this.resetSessionStats();
  }

  private clearPendingHumanTurnTimeout(): void {
    this.turnManager.clearPendingHumanTurnTimeout();
  }

  getQueueDepth(): number {
    return this.turnManager.getQueueDepth();
  }

  getCurrentQueueItem(): Record<string, unknown> | null {
    return this.turnManager.getCurrentQueueItem();
  }

  getLastQueueTransition(): Record<string, unknown> | null {
    return this.turnManager.getLastQueueTransition();
  }

  getLastAutoActionProbe(): Record<string, unknown> | null {
    return this.turnManager.getLastAutoActionProbe();
  }

  getLastDriveMarker(): string {
    return this.lastDriveMarker;
  }

  getPendingSeatReleaseCount(): number {
    return this.pendingSeatReleaseUserIds.size;
  }

  getLastAcceptedActionSnapshot(handId: string): Record<string, unknown> | null {
    return this.lastAcceptedActionSnapshotByHandId.get(handId) ?? null;
  }

  getActorSnapshotForHand(handId: string): Record<string, unknown> | null {
    if (this.state.handId !== handId) return null;
    const toActUserId =
      this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
    return {
      handId,
      street: this.state.street,
      roundState: this.state.roundState,
      toActSeat: this.state.toActSeat,
      toActUserId,
      actorKind: toActPlayer?.kind ?? null,
      actorConnected: toActPlayer?.connected ?? null,
      actorNeedsAction: toActPlayer?.needsAction ?? null,
      actorStatus: toActPlayer?.status ?? null,
      turnDeadlineMs: this.state.turnDeadlineMs,
      nextStepOwner: this.nextStepOwner,
      resolvedActionId: this.resolvedActionId,
      lastAction: this.currentHand?.lastAction ?? null,
      lastMarker: this.lastDriveMarker,
    };
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
    // Arm human turn timer before building snapshot so client receives turnDeadlineMs and can show countdown.
    this.ensureHumanTurnTimerForCurrentActor(`SNAPSHOT:${reason}`);
    const ensureRecipient = this.pendingActorRef
      ? { userId: this.pendingActorRef.userId, client: this.pendingActorRef.client }
      : undefined;
    await this.snapshotService.emitToAll(reason, actionId, ensureRecipient);
  }

}





