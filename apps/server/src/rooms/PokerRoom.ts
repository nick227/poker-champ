/**
 * Import dependencies for the poker room implementation
 * - Room, Client, CloseCode: Core Colyseus room management
 * - PokerState: The game state management class
 * - Dealer: Core poker game engine that handles all game logic
 * - Various schemas: Type validation for incoming/outgoing messages
 * - Services: Authentication, persistence, economy, and other business logic
 * - Utilities: Logging, rate limiting, bot management, etc.
 */
import { Room, Client } from "@colyseus/core";
import { PokerState } from "../state/PokerState.js";
import { Dealer } from "../engine/Dealer.js";
import { logger } from "../lib/logger.js";
import { PersistenceFacade } from "../engine/persistence/PersistenceFacade.js";
import { AuthService } from "../engine/auth/AuthService.js";
import {
  TableOutboundMessageSchema,
} from "@poker-champ/realtime-contract";
import { nanoid } from "nanoid";
import { newBotId } from "../engine/bots/botIds.js";
import {
  isDecisionStallDetectionEnabled,
  isPersistentSeatsEnabled,
  isTableSnapshotLogPersistenceEnabled,
} from "../config/features.js";
import { getSeatHardDeleteHours, getSeatRetentionHours } from "../config/seats.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSnapshotLogService, type SnapshotLogReason } from "../engine/persistence/TableSnapshotLogService.js";
import type { FrameReason } from "../engine/replay/FrameReason.js";
import { presenceIndex } from "../lobby/PresenceIndex.js";
import { createPerClientRateLimiter } from "./perClientRateLimit.js";
import { listEnabledBotSummaries } from "../engine/bots/BotCatalog.js";
import { getPrisma } from "@poker-champ/db";
import { tournamentSeatGrantExternalRef } from "../tournaments/tournament.constants.js";
import { getBlindLevel } from "../tournaments/blind-structure.js";
import type { TournamentTableOverlay } from "../tournaments/tournament-overlay.js";
import { tournamentTableReconciler } from "../tournaments/TournamentTableReconciler.js";
import { awardService } from "../awards/index.js";
import { PokerRoomController } from "./room/PokerRoomController.js";
import { dealerRuntimeMetrics } from "../engine/dealer/metrics/dealerRuntimeMetrics.js";
import { resolvePlayersReadyForNextHand } from "../engine/dealer/utils/TableNavigator.js";
import type {
  PokerRoomFacade,
  JoinOptions,
  AuthContext,
  TableConfig,
  PokerRoomMetadata,
  InstantGamePresetId,
  InstantGameSeedConfig,
} from "./room/types/PokerRoomTypes.js";


/** Close code when leaving due to joining another table; client treats as non-error and does not reconnect. */
/** Must differ from CloseCode.CONSENTED (4000) so onLeave can tell user leave from session-replaced. */
const LEAVE_CODE_SESSION_REPLACED = 4001;
const MIN_RECONNECT_TIMEOUT_MS = 20 * 60_000;

export function resolveReconnectTimeoutMs(rawValue: unknown): number {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw <= 0) return MIN_RECONNECT_TIMEOUT_MS;
  return Math.max(MIN_RECONNECT_TIMEOUT_MS, Math.floor(raw));
}





/**
 * Main poker room class that manages a single poker table
 * Extends Colyseus Room to handle real-time multiplayer poker
 * 
 * Key responsibilities:
 * - Client connection/disconnection and session management
 * - Message routing and validation
 * - Game state synchronization
 * - Player seat persistence and recovery
 * - Bot management
 * - Rate limiting and security
 * - Lifecycle management (idle disposal, cleanup)
 * 
 * The room acts as the orchestrator between clients, the Dealer engine,
 * and various persistence/services layers.
 */
export class PokerRoom extends Room<{ state: PokerState; metadata: PokerRoomMetadata }> implements PokerRoomFacade {

  /**
   * Keep cash-game rooms discoverable/joinable even when temporarily empty.
   * This allows players to rejoin after disconnects and maintains table
   * presence in the lobby system.
   */
  override autoDispose = false;

  /**
   * Core poker game engine that handles all game logic, hand progression,
   * betting rounds, pot management, and player state transitions.
   */
  private dealer!: Dealer;
  private controller!: PokerRoomController;
  private tournamentId?: string;
  private tournamentStartingStackCents?: number;
  private tournamentOverlay: TournamentTableOverlay | null = null;
  private tournamentPlayEnded = false;
  /** Set by the table-balance reconciler when this table has been chosen to break (MTT proposal).
   *  Blocks new hands the same way tournamentPlayEnded does; the table has 0 players left once its
   *  redistribution completes in the same reconcile pass, so no further gating is needed. */
  private tournamentTableBreaking = false;
  /** Set while this table is holding for hand-for-hand (MTT proposal Phase 4): it finished its
   *  current hand and is waiting for every other live table to also report ready. Cleared by
   *  releaseHandForHandHold() once the whole tournament is released together. */
  private tournamentHandForHandWaiting = false;
  /** MTT proposal Phase 3: userId -> the table number a balance move just relocated them to.
   *  Surfaced once (via hero.tournamentViewer.movedToTableNumber) to whichever client is still
   *  connected to this room after removeTournamentPlayerForTableTransfer, then cleared. */
  private readonly movedToTableNumberByUserId: Map<string, number> = new Map();
  // Back-compat bridge for tests and legacy paths; SessionManager is the owner of mutations.
  readonly userIdBySessionId: Map<string, string> = new Map();
  readonly bindingEpochByUserId: Map<string, number> = new Map();
  readonly bindingEpochBySessionId: Map<string, number> = new Map();
  /**
   * Cleanup function for session event listeners. Called when the room
   * is disposed to prevent memory leaks.
   */
  private unbindSessionEvent?: () => void;
  /**
   * Whether persistent seats feature is enabled. When enabled, player
   * seats and chip stacks survive disconnects and server restarts.
   */
  private get persistentSeatsEnabled(): boolean {
    return isPersistentSeatsEnabled();
  }
  /**
   * Whether table snapshot logging is enabled. When enabled, all game
   * state changes are logged for auditing, replay, and analysis.
   */
  private readonly snapshotLogEnabled = isTableSnapshotLogPersistenceEnabled();
  /**
   * Timestamp of last snapshot emission (ms). Used by stall detection to log TABLE_STALLED.
   */
  private lastSnapshotAt = 0;
  /**
   * Last snapshot sequence number from emit hook. Included in TABLE_STALLED for context.
   */
  private lastSnapshotSeq: number | undefined = undefined;
  /**
   * Interval for table stall detection. Cleared in onDispose.
   */
  private stallCheckInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Rate-limit stall diagnostics to avoid log storms when a table is unhealthy.
   */
  private lastStallLogAtMs = 0;
  private lastStallRedriveLogAtMs = 0;
  private lastRuntimeMetricsLogAtMs = 0;
  private lastTurnKey = "";
  private lastTurnAssignedAtMs = 0;
  /**
   * Per-key join locks to prevent race conditions when multiple clients
   * try to join simultaneously for the same user. Key format: "tableId:userId"
   */
  private readonly joinLocksByKey: Map<string, Promise<void>> = new Map();
  /**
   * Reader/writer lock guarding the final disposal decision against joins, reconnects, and
   * economic admission. Joins/reconnects/admissions are "readers": frequent, and only need to
   * exclude a disposal that is *concurrently* deciding, not each other -- so any number of them
   * run in parallel. handleIdleDisposeTimer/requestDisconnect are the sole "writer": rare, and
   * needs exclusive access (waits for in-flight readers to drain, blocks new readers meanwhile)
   * so its canIdleDispose() check and the actual disconnect stay atomic against a join landing
   * mid-decision. A single FIFO mutex here would make every join wait behind every other join,
   * not just behind disposal -- this keeps the hot (join) path cheap while keeping the same
   * correctness guarantee on the cold (disposal) path.
   */
  private lifecycleReaderCount = 0;
  private lifecycleWriterActive = false;
  /** Writers that have called lifecycleAcquireWrite but not yet acquired -- see lifecycleAcquireRead. */
  private lifecycleWritersWaiting = 0;
  private lifecycleWaitQueue: Array<() => void> = [];
  /**
   * Per-user in-flight buy-in/rebuy admissions (userId -> token -> refcount). Held from before
   * the CashierService DB commit until after the room-side applyRebuy/addPlayer sync completes,
   * so a concurrent cash-out for the same user can see "money already committed but not yet
   * reflected in room state" even before the player is seated, and refuse to race it.
   */
  private readonly buyInAdmissionsByUser = new Map<string, Map<string, number>>();
  /** userIds with an in-flight cash-out (past the seat/admission guard, before the ledger call resolves). */
  private readonly cashOutAdmissionUsers = new Set<string>();
  /**
   * Schema version for persistent seat data. Used to detect and handle
   * data migration scenarios when the seat schema changes.
   */
  private readonly seatSchemaVersion = 1;
  /**
   * Rate limiter for player actions to prevent spam and abuse.
   * Limits: 30 actions per minute per client.
   */
  private readonly actionRateLimit = createPerClientRateLimiter({ maxPerWindow: 30, windowMs: 60_000 });
  /**
   * Rate limiter for chat messages to prevent spam.
   * Limits: 20 messages per minute per client.
   */
  private readonly chatRateLimit = createPerClientRateLimiter({ maxPerWindow: 20, windowMs: 60_000 });
  private readonly lastAcceptedActionByUserId: Map<
    string,
    { action: string; amountCents?: number; actionId: string; atTs: number }
  > = new Map();

  /**
   * Timestamp of last activity in this room. Used for idle detection
   * and automatic room disposal after inactivity.
   */
  private lastActiveAtTs = Date.now();
  /**
   * Timestamp when the room became empty (no connected clients).
   * Null when the room has clients. Used for grace period before disposal.
   */
  private emptySinceTs: number | null = null;
  /**
   * Timer for idle room disposal. Set when room becomes empty and
   * cleared when clients reconnect.
   */
  private idleDisposeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Independently invalidates async checks and already-queued timer callbacks. */
  private idleEvaluationGeneration = 0;
  private idleTimerGeneration = 0;
  /**
   * Idle timeout in milliseconds before disposing an inactive room.
   * Room is disposed if no activity for this duration while empty.
   * Default: 30 minutes (configurable via POKER_ROOM_IDLE_DISPOSE_MS)
   */
  private readonly IDLE_DISPOSE_MS = Number(process.env.POKER_ROOM_IDLE_DISPOSE_MS ?? 30 * 60_000);
  /**
   * Reconnection grace timeout for unintentional disconnects.
   * Default: 20 minutes (configurable via POKER_RECONNECT_TIMEOUT_MS).
   */
  private readonly RECONNECT_TIMEOUT_MS = (() => {
    return resolveReconnectTimeoutMs(process.env.POKER_RECONNECT_TIMEOUT_MS);
  })();
  /**
   * Flag indicating whether this room is being deleted. Prevents
   * new joins and handles cleanup during disposal.
   */
  private isDeleting = false;
  private pendingInstantGameSeed: InstantGameSeedConfig | null = null;
  private instantGameSeedInProgress = false;
  private instantGameSeedCompleted = false;

  private logInstantGameMemoryPhase(phase: string, extra?: Record<string, unknown>): void {
    if (process.env.POKER_INSTANT_GAME_DEBUG !== "1") return;
    const memory = process.memoryUsage();
    logger.info(
      {
        roomId: this.roomId,
        tableId: this.state.tableId,
        phase,
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        rssMB: Math.round(memory.rss / 1024 / 1024),
        ...extra,
      },
      "INSTANT_GAME_MEMORY_PHASE",
    );
  }

  /**
   * Called when the room is first created. Initializes the poker table,
   * sets up message handlers, configures the dealer, and establishes
   * persistent seat recovery.
   * 
   * @param options - Room creation options including table configuration
   */
  onCreate(options: unknown) {
    const optionsObj = (options && typeof options === "object" ? (options as Record<string, unknown>) : {});
    // Keep explicit in onCreate as well for defensive clarity in runtime logs.
    this.autoDispose = false;
    logger.info(
      {
        roomId: this.roomId,
        reconnectTimeoutMs: this.RECONNECT_TIMEOUT_MS,
        persistentSeatsEnabled: this.persistentSeatsEnabled,
        decisionStallDetectionEnabled: isDecisionStallDetectionEnabled(),
      },
      "POKER_ROOM_TIMEOUT_CONFIG",
    );

    // Initialize the game state with a fresh PokerState instance
    this.setState(new PokerState());

    // Extract table configuration from creation options
    const cfg = (optionsObj.tableConfig && typeof optionsObj.tableConfig === "object"
      ? (optionsObj.tableConfig as TableConfig)
      : undefined);

    // Configure table state from provided config or use defaults
    this.state.tableId = cfg?.tableId ?? ((typeof optionsObj.tableId === "string" ? optionsObj.tableId : undefined) ?? "table_poc");
    this.state.tableName = cfg?.name ?? "Hold'em";
    this.state.creatorId = cfg?.creatorId != null ? String(cfg.creatorId) : "";
    this.state.visibility = cfg?.visibility ?? "PUBLIC";
    this.state.speed = cfg?.speed ?? "normal";
    this.state.maxSeats = cfg?.maxSeats ?? 9;
    this.state.createdAtTs = cfg?.createdAt ?? Date.now();

    // Set betting limits and game parameters
    this.state.smallBlindCents = cfg?.smallBlindCents ?? this.state.smallBlindCents;
    this.state.bigBlindCents = cfg?.bigBlindCents ?? this.state.bigBlindCents;
    this.state.minBuyInCents = cfg?.minBuyInCents ?? this.state.minBuyInCents;
    this.state.maxBuyInCents = cfg?.maxBuyInCents ?? this.state.maxBuyInCents;
    this.state.showStats = cfg?.showStats ?? false;
    this.tournamentId = cfg?.tournamentId;
    this.state.tournamentMode = Boolean(cfg?.tournamentId || cfg?.gameMode === "TOURNAMENT");
    this.tournamentStartingStackCents =
      cfg?.gameMode === "TOURNAMENT" ? cfg.minBuyInCents : undefined;

    // Limit maximum clients to the table's seat capacity
    this.maxClients = this.state.maxSeats;

    // Set initial room metadata for lobby discovery
    this.setMetadata({
      tableId: this.state.tableId,
      creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      creatorName: cfg?.creatorName ?? "Player",
      creatorAvatarUrl: cfg?.creatorAvatarUrl ?? null,
      tournamentId: cfg?.tournamentId,
      gameMode: cfg?.gameMode ?? "CASH",
      updatedAt: Date.now(),
    });

    // Initialize the Dealer with game state and persistence callbacks
    this.dealer = new Dealer(
      this.state,
      new PersistenceFacade({
        tableId: this.state.tableId,
        tableName: this.state.tableName,
        creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      }),
      {
      // Callback when a player reaches auto sit-out cap
      onAutoSitOutReachedCap: async ({ userId, stackCents }) => {
        if (!this.persistentSeatsEnabled) return;
        await TableSeatSessionService.markSittingOut({
          tableId: this.state.tableId,
          userId,
          stackCentsSnapshot: stackCents,
          handIdSnapshot: this.state.handId || undefined,
        });
      },
      // Centralized occupancy-changed signal (see Dealer's onPlayerRemoved doc comment): fired
      // whenever any removal path actually vacates a seat, including DisconnectManager's
      // periodic sweep, which has no room-level caller to follow up afterward. Deliberately not
      // folded into onTableSnapshotEmitted below: a SEAT_CHANGE snapshot while street === WAITING
      // resolves to "lightweight_waiting" build mode and never reaches that hook at all -- exactly
      // the case that matters for a table becoming newly disposable.
      onPlayerRemoved: () => {
        this.updateMetadataCounts();
        void this.reevaluateIdleLifecycle();
      },
      // Callback when table state snapshot is emitted for logging and stall detection.
      // Invoked by SnapshotService.emitToAll and emitToUser only, so lastSnapshotAt stays accurate for TABLE_STALLED.
      onTableSnapshotEmitted: async (snapshot) => {
        this.lastSnapshotAt = Date.now();
        // Hand completion can be the final transition that makes an otherwise empty
        // cash table disposable. Socket presence is not table ownership.
        void this.reevaluateIdleLifecycle();
        const payload = snapshot.payloadJson as { snapshotSeq?: number } | undefined;
        if (typeof payload?.snapshotSeq === "number") this.lastSnapshotSeq = payload.snapshotSeq;
        if (!this.snapshotLogEnabled) return;
        const mappedReason = this.mapSnapshotReason(snapshot.reason, snapshot.frameReason);
        if (!mappedReason) return;
        try {
          await TableSnapshotLogService.writeSnapshot({
            tableId: snapshot.tableId,
            handId: snapshot.handId,
            snapshotId: snapshot.snapshotId,
            reason: mappedReason,
            street: snapshot.street,
            payloadJson: snapshot.payloadJson,
            stateHash: snapshot.stateHash,
            schemaVersion: snapshot.schemaVersion,
          });
        } catch (err) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: snapshot.tableId,
              handId: snapshot.handId,
              snapshotId: snapshot.snapshotId,
              reason: mappedReason,
              message: (err as Error | undefined)?.message ?? String(err),
            },
            "SNAPSHOT_LOG_WRITE_FAILED",
          );
        }
      },
      getAvatarByUserId: async (userId: string) => {
        const user = await getPrisma().user.findUnique({
          where: { id: userId },
          select: { avatarUrl: true, avatarVersion: true },
        });
        return user
          ? { avatarUrl: user.avatarUrl ?? null, avatarVersion: user.avatarVersion ?? null }
          : { avatarUrl: null, avatarVersion: null };
      },
      onHandEndedAwards: async (handSummary, dealtUserIds, getSessionState) => {
        await awardService.processHandEndAwards(handSummary, dealtUserIds, getSessionState);
      },
      onTournamentWaitingAfterHand: async () => {
        if (!this.tournamentId) return;
        await tournamentTableReconciler.reconcileAfterHand({
          tournamentId: this.tournamentId,
          tableId: this.state.tableId,
          roomId: this.roomId,
          state: this.state,
          tableName: this.state.tableName,
          removeBustedPlayer: async (userId) => {
            await this.removeTournamentBustedPlayer(userId);
          },
          removePlayerForTableTransfer: async (userId, destinationTableNumber) => {
            return this.removeTournamentPlayerForTableTransfer(userId, destinationTableNumber);
          },
          onOverlayUpdated: (overlay) => {
            this.tournamentOverlay = overlay;
          },
          onPlayEnded: () => {
            this.tournamentPlayEnded = true;
          },
          onTableBreaking: () => {
            this.tournamentTableBreaking = true;
          },
          onHandForHandHold: () => {
            this.tournamentHandForHandWaiting = true;
          },
          onHandForHandRelease: () => {
            this.tournamentHandForHandWaiting = false;
            this.dealer.redriveAfterExternalUnblock("HAND_FOR_HAND_RELEASED");
          },
          emitSnapshot: async () => {
            await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
          },
        });
      },
      isNextHandBlocked: () =>
        this.tournamentPlayEnded || this.tournamentTableBreaking || this.tournamentHandForHandWaiting,
      getTournamentTableOverlay: () => this.tournamentOverlay,
      getMovedToTableNumber: (userId) => this.movedToTableNumberByUserId.get(userId),
    });

    if (this.tournamentId) {
      void this.refreshTournamentOverlayFromDb();
    }

    this.controller = new PokerRoomController(this);
    this.controller.setupLifecycle({ cfg });
    this.controller.setupMessageHandlers();

    this.pendingInstantGameSeed = cfg?.instantGameSeed ?? null;
    this.instantGameSeedInProgress = false;
    this.instantGameSeedCompleted = false;
  }

  get leaveCodeSessionReplaced(): number {
    return LEAVE_CODE_SESSION_REPLACED;
  }

  get dealerRef(): Dealer {
    return this.dealer;
  }

  get reconnectTimeoutMs(): number {
    return this.RECONNECT_TIMEOUT_MS;
  }

  get isDeletingInternal(): boolean {
    return this.isDeleting;
  }

  get persistentSeatsEnabledInternal(): boolean {
    return this.persistentSeatsEnabled;
  }

  private get controllerRequired(): PokerRoomController {
    if (!this.controller) {
      throw new Error("POKER_ROOM_CONTROLLER_MISSING: onCreate must initialize controller before room hooks.");
    }
    return this.controller;
  }

  /**
   * Room facade surface for orchestration services.
   * These `*Internal` methods are intentional boundary adapters so services
   * can coordinate behavior without touching room internals directly.
   */
  setSessionEventUnbindInternal(unbind: () => void): void {
    this.unbindSessionEvent = unbind;
  }

  updateCreateMetadataInternal(cfg?: TableConfig): void {
    const humanCount = this.computeHumanCount();
    const connectedHumanCount = this.computeConnectedHumanCount();
    const seatedCount = this.computeSeatedCount();
    void this.setMetadata({
      tableId: this.state.tableId,
      name: this.state.tableName,
      maxSeats: this.state.maxSeats,
      smallBlindCents: this.state.smallBlindCents,
      bigBlindCents: this.state.bigBlindCents,
      minBuyInCents: this.state.minBuyInCents,
      maxBuyInCents: this.state.maxBuyInCents,
      visibility: this.state.visibility,
      showStats: this.state.showStats,
      passwordHash: cfg?.passwordHash,
      speed: cfg?.speed ?? "normal",
      createdAt: this.state.createdAtTs,
      updatedAt: Date.now(),
      runningSince: undefined,
      creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      creatorName: cfg?.creatorName ?? "Player",
      creatorAvatarUrl: cfg?.creatorAvatarUrl ?? null,
      tournamentId: this.tournamentId,
      gameMode: cfg?.gameMode ?? (this.tournamentId ? "TOURNAMENT" : "CASH"),
      humanCount,
      connectedHumanCount,
      seatedCount,
    });
  }

  getTournamentIdInternal(): string | undefined {
    return this.tournamentId;
  }

  getTournamentSeatedHumanUserIds(): string[] {
    const ids: string[] = [];
    for (const player of this.state.playersById.values()) {
      if (player.kind === "HUMAN") ids.push(player.id);
    }
    return ids;
  }

  getTournamentSeatedPlayerCount(): number {
    return this.state.playersById.size;
  }

  getTournamentStartingStackCentsInternal(): number | undefined {
    return this.tournamentStartingStackCents;
  }

  async removeTournamentBustedPlayer(userId: string): Promise<void> {
    await this.dealer.removePlayer(userId, { cashOutAfterRemoval: false });
  }

  /**
   * Source side of an intra-tournament table-balance move (MTT proposal). Cash-free removal --
   * the returned stack is carried to the destination room via seatTournamentPlayerForTableTransfer,
   * never cashed out. Null if this user isn't seated here (already moved / stale caller).
   *
   * When `destinationTableNumber` is given, marks this user's `movedToTableNumber` (Phase 3:
   * realtime "you've been moved" transition) so their next snapshot from this room -- they may
   * still be connected here even though they're no longer seated -- carries it, then broadcasts
   * and clears the marker so it's surfaced exactly once.
   */
  async removeTournamentPlayerForTableTransfer(
    userId: string,
    destinationTableNumber?: number,
  ): Promise<number | null> {
    if (destinationTableNumber == null) {
      return this.dealer.removePlayerForTableTransfer(userId);
    }
    this.movedToTableNumberByUserId.set(userId, destinationTableNumber);
    try {
      const stackCents = await this.dealer.removePlayerForTableTransfer(userId);
      await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
      return stackCents;
    } finally {
      this.movedToTableNumberByUserId.delete(userId);
    }
  }

  /** Destination side of an intra-tournament table-balance move. Seats the player at their exact
   *  carried-over stack; not a rebuy, no economy movement. */
  async seatTournamentPlayerForTableTransfer(userId: string, displayName: string, stackCents: number): Promise<void> {
    await this.dealer.seatPlayerAtStackForTableTransfer(userId, displayName, stackCents);
  }

  /**
   * Hand-for-hand release (MTT proposal Phase 4). Called via matchMaker.remoteRoomCall by whichever
   * table's post-hand pass detects every live table is ready; clears this table's own hold and
   * kicks the drive loop so it deals its next hand immediately rather than waiting for some other
   * event to notice isNextHandBlocked flipped.
   */
  async releaseHandForHandHold(): Promise<void> {
    this.tournamentHandForHandWaiting = false;
    this.dealer.redriveAfterExternalUnblock("HAND_FOR_HAND_RELEASED");
  }

  private async refreshTournamentOverlayFromDb(): Promise<void> {
    if (!this.tournamentId) return;
    const tournament = await getPrisma().tournament.findUnique({
      where: { id: this.tournamentId },
    });
    if (!tournament) return;
    const level = getBlindLevel(tournament.blindStructureId, tournament.currentLevel);
    // Best-effort: right after onCreate, the TournamentTable row's roomId may not be persisted
    // yet (the caller finalizes that link after room creation returns) -- tableNumber is cosmetic
    // UI-only, so a brief undefined window here is fine; the reconciler's own overlay update
    // (every post-hand pass) fills it in once the link exists.
    const tableNumber = await this.resolveTournamentTableNumber();
    this.tournamentOverlay = {
      tournamentId: tournament.id,
      status: tournament.status,
      currentLevel: tournament.currentLevel,
      smallBlindCents: level.smallBlindCents,
      bigBlindCents: level.bigBlindCents,
      anteCents: level.anteCents,
      nextLevelAtTs: tournament.nextLevelAt?.getTime() ?? null,
      playFormat: tournament.playFormat as "FREEZEOUT" | "REBUY",
      ...(tableNumber != null ? { tableNumber } : {}),
    };
  }

  private async resolveTournamentTableNumber(): Promise<number | undefined> {
    if (!this.tournamentId) return undefined;
    const table = await getPrisma().tournamentTable.findFirst({
      where: { tournamentId: this.tournamentId, roomId: this.roomId },
      select: { tableNumber: true },
    });
    return table?.tableNumber;
  }

  async applyTournamentBlinds(payload: {
    currentLevel: number;
    smallBlindCents: number;
    bigBlindCents: number;
    anteCents: number;
    nextLevelAtTs: number;
    status: string;
  }): Promise<{ applied: boolean }> {
    if (!this.tournamentId) return { applied: false };
    if (this.state.street !== "WAITING") return { applied: false };

    this.state.smallBlindCents = payload.smallBlindCents;
    this.state.bigBlindCents = payload.bigBlindCents;
    this.tournamentOverlay = {
      ...this.tournamentOverlay,
      tournamentId: this.tournamentId,
      status: payload.status,
      currentLevel: payload.currentLevel,
      smallBlindCents: payload.smallBlindCents,
      bigBlindCents: payload.bigBlindCents,
      anteCents: payload.anteCents,
      nextLevelAtTs: payload.nextLevelAtTs,
    };
    await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
    return { applied: true };
  }

  startStallMonitorInternal(): void {
    const STALL_CHECK_MS = 10_000;
    const STALL_THRESHOLD_MS = 15_000;
    const STALL_LOG_MIN_INTERVAL_MS = 5_000;
    const METRICS_LOG_INTERVAL_MS = 60_000;
    const decisionStallDetectionEnabled = isDecisionStallDetectionEnabled();
    this.stallCheckInterval = setInterval(() => {
      const connectedHumanCount = this.computeConnectedHumanCount();
      if (connectedHumanCount === 0) return;

      const queueDepth = this.dealer.getQueueDepth();
      dealerRuntimeMetrics.observeQueueDepth(queueDepth);
      const now = Date.now();
      const activeHandForStall = this.state.street !== "WAITING" && this.state.street !== "SHOWDOWN";
      const waitingTurns = activeHandForStall && this.state.toActSeat >= 0 ? 1 : 0;
      this.refreshTurnAssignment(now);
      const turnAgeMs = this.lastTurnAssignedAtMs > 0 ? now - this.lastTurnAssignedAtMs : 0;
      const snapshotSilenceMs = this.lastSnapshotAt > 0 ? now - this.lastSnapshotAt : Number.POSITIVE_INFINITY;
      const decisionTraceId =
        this.dealer.getLastDecisionTraceIdPublic() ??
        `stall_${this.state.tableId}_${this.state.handId || "none"}_${now}`;
      if (waitingTurns === 0) {
        const betweenHandsReady = resolvePlayersReadyForNextHand(this.state);
        const nextHandStartDue =
          this.state.nextHandAtTs === 0 ||
          (this.state.nextHandAtTs > 0 && now >= this.state.nextHandAtTs);
        if (
          this.state.street === "WAITING" &&
          betweenHandsReady.length >= 2 &&
          nextHandStartDue &&
          !this.tournamentPlayEnded &&
          !this.tournamentTableBreaking &&
          !this.tournamentHandForHandWaiting &&
          snapshotSilenceMs >= STALL_THRESHOLD_MS
        ) {
          if (this.lastStallRedriveLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                tournamentId: this.tournamentId,
                handId: this.state.handId,
                street: this.state.street,
                snapshotSeq: this.lastSnapshotSeq,
                readyPlayerCount: betweenHandsReady.length,
                readyCount: betweenHandsReady.length,
                activeCount: this.getActivePlayerCountInternal(),
                nextHandAtTs: this.state.nextHandAtTs,
                snapshotSilenceMs,
                reason: "next_hand_overdue",
              },
              "NEXT_HAND_OVERDUE",
            );
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                tournamentId: this.tournamentId,
                handId: this.state.handId,
                street: this.state.street,
                snapshotSeq: this.lastSnapshotSeq,
                readyCount: betweenHandsReady.length,
                activeCount: this.getActivePlayerCountInternal(),
                nextHandAtTs: this.state.nextHandAtTs,
                snapshotSilenceMs,
                reason: "between_hands_watchdog",
              },
              "BETWEEN_HANDS_STALL_RECOVERY_REDRIVE",
            );
            this.lastStallRedriveLogAtMs = now;
            dealerRuntimeMetrics.recordTableStallRecoveryRedrive();
          }
          void this.emitSnapshotsToAllSafeInternal("AUTO_TRANSITION").catch((err: unknown) => {
            logger.error(
              {
                err,
                roomId: this.roomId,
                tableId: this.state.tableId,
                tournamentId: this.tournamentId,
                handId: this.state.handId,
                street: this.state.street,
                snapshotSeq: this.lastSnapshotSeq,
                nextHandAtTs: this.state.nextHandAtTs,
                readyCount: betweenHandsReady.length,
                activeCount: this.getActivePlayerCountInternal(),
                reason: "between_hands_watchdog_snapshot",
                message: err instanceof Error ? err.message : String(err),
              },
              "WATCHDOG_SNAPSHOT_FAILED",
            );
          });
          this.dealer.recoverBetweenHandsPublic();
        }
        if (this.lastRuntimeMetricsLogAtMs + METRICS_LOG_INTERVAL_MS < now) {
          logger.info(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              activeTables: 1,
              waitingTurns,
              ...dealerRuntimeMetrics.snapshot(),
            },
            "DEALER_RUNTIME_METRICS",
          );
          this.lastRuntimeMetricsLogAtMs = now;
        }
        return;
      }

      this.dealer.logEngineDecisionPublic("STALL_MONITOR_TICK");
      if (decisionStallDetectionEnabled) {
        if (activeHandForStall) {
          const stallReason = this.dealer.getStallReasonPublic(now);
          if (stallReason) {
          // Decision stall reasons can be transient while lifecycle/snapshot work is still settling.
          // Avoid false positives and premature redrive until silence exceeds the same threshold used by legacy mode.
          if (snapshotSilenceMs < STALL_THRESHOLD_MS) {
            this.dealer.logTurnStalledIfNeeded();
            if (queueDepth >= 2) {
              logger.warn(
                { roomId: this.roomId, tableId: this.state.tableId, handId: this.state.handId, queueDepth },
                "QUEUE_DEPTH_HIGH",
              );
            }
            if (this.lastRuntimeMetricsLogAtMs + METRICS_LOG_INTERVAL_MS < now) {
              logger.info(
                {
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  activeTables: 1,
                  waitingTurns,
                  ...dealerRuntimeMetrics.snapshot(),
                },
                "DEALER_RUNTIME_METRICS",
              );
              this.lastRuntimeMetricsLogAtMs = now;
            }
            return;
          }
          if (this.lastStallLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                handId: this.state.handId,
                stallReason,
                street: this.state.street,
                toActSeat: this.state.toActSeat,
                snapshotSeq: this.lastSnapshotSeq,
                lastSnapshotAt: this.lastSnapshotAt,
                stallAgeMs: Number.isFinite(snapshotSilenceMs) ? snapshotSilenceMs : -1,
                turnAgeMs,
                decisionTraceId,
                queueDepth,
              },
              "TABLE_STALLED",
            );
            this.lastStallLogAtMs = now;
            dealerRuntimeMetrics.recordTableStalled();
          }
          // EMERGENCY RECOVERY ONLY — fires after STALL_THRESHOLD_MS of snapshot silence.
          // Normal progression (Phase 3+: scheduleBotAction) should never reach this path.
          // If TABLE_STALLED_RECOVERY_REDRIVE appears frequently in metrics, diagnose the
          // primary hand loop rather than treating this as an expected recovery mechanism.
          if (this.state.street !== "WAITING" && queueDepth === 0) {
            if (this.lastStallRedriveLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
              logger.warn(
                {
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  tournamentId: this.tournamentId,
                  handId: this.state.handId,
                  street: this.state.street,
                  stallReason,
                  snapshotSeq: this.lastSnapshotSeq,
                  nextHandAtTs: this.state.nextHandAtTs,
                  readyCount: this.getReadyPlayerCountInternal(),
                  activeCount: this.getActivePlayerCountInternal(),
                  stallAgeMs: Number.isFinite(snapshotSilenceMs) ? snapshotSilenceMs : -1,
                  turnAgeMs,
                  decisionTraceId,
                  reason: "active_hand_watchdog",
                },
                "TABLE_STALLED_RECOVERY_REDRIVE",
              );
              this.lastStallRedriveLogAtMs = now;
              dealerRuntimeMetrics.recordTableStallRecoveryRedrive();
            }
            void this.emitSnapshotsToAllSafeInternal("AUTO_TRANSITION").catch((err: unknown) => {
              logger.error(
                {
                  err,
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  tournamentId: this.tournamentId,
                  handId: this.state.handId,
                  street: this.state.street,
                  snapshotSeq: this.lastSnapshotSeq,
                  nextHandAtTs: this.state.nextHandAtTs,
                  readyCount: this.getReadyPlayerCountInternal(),
                  activeCount: this.getActivePlayerCountInternal(),
                  reason: "active_hand_watchdog_snapshot",
                  message: err instanceof Error ? err.message : String(err),
                },
                "WATCHDOG_SNAPSHOT_FAILED",
              );
            });
            this.dealer.maybeActForBotPublic();
          }
        }
        }
      } else {
        const toActUserId =
          this.state.toActSeat >= 0 ? (this.state.seats[this.state.toActSeat] ?? "") : "";
        const toActPlayer = toActUserId ? this.state.playersById.get(toActUserId) : undefined;
        const waitingOnConnectedHumanTurn =
          this.state.street !== "WAITING" &&
          this.state.street !== "SHOWDOWN" &&
          this.state.runoutMode !== "STAGED" &&
          this.state.toActSeat >= 0 &&
          !!toActPlayer &&
          toActPlayer.kind === "HUMAN" &&
          toActPlayer.connected &&
          toActPlayer.status === "ACTIVE";

        if (
          activeHandForStall &&
          !waitingOnConnectedHumanTurn &&
          this.lastSnapshotAt > 0 &&
          now - this.lastSnapshotAt > STALL_THRESHOLD_MS
        ) {
          const stallReason = this.dealer.getStallReasonPublic(now);
          if (this.lastStallLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                handId: this.state.handId,
                stallReason,
                street: this.state.street,
                toActSeat: this.state.toActSeat,
                snapshotSeq: this.lastSnapshotSeq,
                lastSnapshotAt: this.lastSnapshotAt,
                stallAgeMs: Number.isFinite(snapshotSilenceMs) ? snapshotSilenceMs : -1,
                turnAgeMs,
                decisionTraceId,
                queueDepth,
              },
              "TABLE_STALLED",
            );
            this.lastStallLogAtMs = now;
            dealerRuntimeMetrics.recordTableStalled();
          }
          // EMERGENCY RECOVERY ONLY — see comment in decision-mode recovery path above.
          if (this.state.street !== "WAITING" && queueDepth === 0) {
            if (this.lastStallRedriveLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
              logger.warn(
                {
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  tournamentId: this.tournamentId,
                  handId: this.state.handId,
                  street: this.state.street,
                  stallReason,
                  snapshotSeq: this.lastSnapshotSeq,
                  nextHandAtTs: this.state.nextHandAtTs,
                  readyCount: this.getReadyPlayerCountInternal(),
                  activeCount: this.getActivePlayerCountInternal(),
                  stallAgeMs: Number.isFinite(snapshotSilenceMs) ? snapshotSilenceMs : -1,
                  turnAgeMs,
                  decisionTraceId,
                  reason: "active_hand_watchdog",
                },
                "TABLE_STALLED_RECOVERY_REDRIVE",
              );
              this.lastStallRedriveLogAtMs = now;
              dealerRuntimeMetrics.recordTableStallRecoveryRedrive();
            }
            void this.emitSnapshotsToAllSafeInternal("AUTO_TRANSITION").catch((err: unknown) => {
              logger.error(
                {
                  err,
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  tournamentId: this.tournamentId,
                  handId: this.state.handId,
                  street: this.state.street,
                  snapshotSeq: this.lastSnapshotSeq,
                  nextHandAtTs: this.state.nextHandAtTs,
                  readyCount: this.getReadyPlayerCountInternal(),
                  activeCount: this.getActivePlayerCountInternal(),
                  reason: "active_hand_watchdog_snapshot",
                  message: err instanceof Error ? err.message : String(err),
                },
                "WATCHDOG_SNAPSHOT_FAILED",
              );
            });
            this.dealer.maybeActForBotPublic();
          }
        }
      }
      this.dealer.logTurnStalledIfNeeded();
      if (queueDepth >= 2) {
        logger.warn(
          { roomId: this.roomId, tableId: this.state.tableId, handId: this.state.handId, queueDepth },
          "QUEUE_DEPTH_HIGH",
        );
      }
      if (this.lastRuntimeMetricsLogAtMs + METRICS_LOG_INTERVAL_MS < now) {
        logger.info(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            activeTables: 1,
            waitingTurns,
            ...dealerRuntimeMetrics.snapshot(),
          },
          "DEALER_RUNTIME_METRICS",
        );
        this.lastRuntimeMetricsLogAtMs = now;
      }
    }, STALL_CHECK_MS);
  }

  private buildTurnKey(): string {
    if (!this.state.handId) return "";
    if (this.state.street === "WAITING" || this.state.street === "SHOWDOWN") return "";
    if (this.state.toActSeat < 0) return "";
    return [
      this.state.handId,
      this.state.street,
      this.state.toActSeat,
      this.state.handActionSeq,
    ].join(":");
  }

  private refreshTurnAssignment(now: number): void {
    const currentKey = this.buildTurnKey();
    if (!currentKey) {
      this.lastTurnKey = "";
      this.lastTurnAssignedAtMs = 0;
      return;
    }
    if (currentKey !== this.lastTurnKey) {
      this.lastTurnKey = currentKey;
      this.lastTurnAssignedAtMs = now;
    }
  }

  touchActivityInternal(): void {
    this.touchActivity();
  }

  handleEmptyStateChangeInternal(): void {
    void this.reevaluateIdleLifecycle();
  }

  scheduleIdleDisposeInternal(): void {
    void this.reevaluateIdleLifecycle();
  }

  async canIdleDisposeInternal(): Promise<boolean> {
    return this.canIdleDispose();
  }

  async reevaluateIdleLifecycleInternal(): Promise<void> {
    await this.reevaluateIdleLifecycle();
  }

  addTablePresenceInternal(client: Client, userId: string, displayName?: string): void {
    this.addTablePresence(client, userId, displayName);
  }

  removeTablePresenceInternal(userId: string): void {
    this.removeTablePresence(userId);
  }

  async bootstrapPersistentSeatRecoveryInternal(): Promise<void> {
    await this.bootstrapPersistentSeatRecovery();
    await this.reevaluateIdleLifecycle();
  }

  async runPersistentSeatCleanupInternal(): Promise<void> {
    await this.runPersistentSeatCleanup();
  }

  async maybeRemoveBotsIfNoHumansInternal(): Promise<void> {
    await this.maybeRemoveBotsIfNoHumans();
  }

  purgeBotsForDeleteInternal(): void {
    this.purgeBotsForDelete();
  }

  async seedInstantBotsInternal(
    presetId: InstantGamePresetId,
    targetBotCountOverride?: number,
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }> {
    return this.seedInstantBots(presetId, targetBotCountOverride);
  }

  sendTableMessageInternal(client: { send: (type: string, payload: unknown) => void }, type: string, payload: unknown): void {
    this.sendTableMessage(client, type, payload);
  }

  updateMetadataCountsInternal(): void {
    this.updateMetadataCounts();
  }

  maybeStartPendingInstantGameSeedInternal(): void {
    if (!this.pendingInstantGameSeed || this.instantGameSeedInProgress || this.instantGameSeedCompleted) return;

    let humanCount = 0;
    for (const player of this.state.playersById.values()) {
      if (player.kind === "HUMAN" && player.status !== "OUT") humanCount += 1;
    }
    if (humanCount <= 0) return;

    const { presetId, targetBotCountOverride } = this.pendingInstantGameSeed;
    this.instantGameSeedInProgress = true;
    queueMicrotask(() => {
      this.logInstantGameMemoryPhase("before_seed_bots", {
        presetId,
        targetBotCountOverride: targetBotCountOverride ?? null,
        seedMode: "first_human_join",
      });
      void this.seedInstantBots(presetId, targetBotCountOverride)
        .then((result) => {
          this.instantGameSeedCompleted = true;
          this.pendingInstantGameSeed = null;
          this.logInstantGameMemoryPhase("after_seed_bots", {
            presetId,
            targetBotCountOverride: targetBotCountOverride ?? null,
            ok: result.ok,
            added: result.added,
            target: result.target,
            reason: result.reason ?? null,
            seedMode: "first_human_join",
          });
        })
        .catch((err: unknown) => {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              presetId,
              targetBotCountOverride: targetBotCountOverride ?? null,
              message: (err as Error | undefined)?.message ?? String(err),
            },
            "INSTANT_BOT_SEED_AFTER_JOIN_FAILED",
          );
        })
        .finally(() => {
          this.instantGameSeedInProgress = false;
        });
    });
  }

  normalizeActionPayloadInternal(payload: unknown): { payload: unknown; actionId: string; handId?: string } | null {
    return this.normalizeActionPayload(payload);
  }

  getPlayerByUserIdInternal(userId: string): { id: string; kind: string; name: string; botId: string } | null {
    return this.getPlayerByUserId(userId);
  }

  getPlayerStackCentsInternal(userId: string): number {
    return this.getPlayerStackCents(userId);
  }

  findPlayerSeatInternal(userId: string): number | null {
    return this.findPlayerSeat(userId);
  }

  withJoinLockInternal(key: string, fn: () => Promise<void>): Promise<void> {
    return this.withJoinLock(key, fn);
  }

  withTableLifecycleLockInternal<T>(fn: () => Promise<T>): Promise<T> {
    return this.withTableLifecycleReadLock(fn);
  }

  processJoinBuyInForZeroStackSeatInternal(userId: string, buyInCents: number): Promise<void> {
    return this.processJoinBuyInForZeroStackSeat(userId, buyInCents);
  }

  logRestoreBindOkInternal(userId: string, sessionId: string): void {
    this.logRestoreBindOk(userId, sessionId);
  }

  markDisconnectedSafeInternal(userId: string, disconnectDeadlineTs: number): Promise<void> {
    return this.markDisconnectedSafe(userId, disconnectDeadlineTs);
  }

  markReconnectedSafeInternal(userId: string): Promise<boolean> {
    return this.markReconnectedSafe(userId);
  }

  clearSittingOutOnRestoreSafeInternal(userId: string): Promise<void> {
    return this.clearSittingOutOnRestoreSafe(userId);
  }

  markAbandonedSafeInternal(userId: string, expectedDisconnectDeadlineTs?: number): Promise<void> {
    return this.markAbandonedSafe(userId, expectedDisconnectDeadlineTs);
  }

  emitSnapshotsToAllSafeInternal(reason: string): Promise<void> {
    return this.emitSnapshotsToAllSafe(reason);
  }

  get lastSnapshotSeqInternal(): number | undefined {
    return this.lastSnapshotSeq;
  }

  getReadyPlayerCountInternal(): number {
    return resolvePlayersReadyForNextHand(this.state).length;
  }

  getActivePlayerCountInternal(): number {
    return Array.from(this.state.playersById.values()).filter((player) => player.status === "ACTIVE").length;
  }

  isChatRateLimitedInternal(sessionId: string): boolean {
    return !this.chatRateLimit.check(sessionId);
  }

  isActionRateLimitedInternal(sessionId: string): boolean {
    return !this.actionRateLimit.check(sessionId);
  }

  setLastAcceptedActionInternal(
    userId: string,
    action: { action: string; amountCents?: number; actionId: string; atTs: number },
  ): void {
    this.lastAcceptedActionByUserId.set(userId, action);
  }

  getLastAcceptedActionInternal(userId: string): { action: string; amountCents?: number; actionId: string; atTs: number } | undefined {
    return this.lastAcceptedActionByUserId.get(userId);
  }

  async onAuth(client: Client, options: unknown, context: { token?: string; headers?: Headers }) {
    if (!this.controller) {
      return this.authenticateInternal(client, options, context);
    }
    return this.controller.auth.authenticate(client, options, context);
  }

  async onJoin(client: Client, options: JoinOptions, auth?: AuthContext) {
    return this.controllerRequired.join.handleJoin(client, options, auth);
  }

  async onLeave(client: Client, code?: number) {
    return this.controllerRequired.leave.handleLeave(client, code);
  }

  /**
   * Validates client authentication tokens and returns user context.
   * Supports multiple token sources: headers, context, or options.
   * 
   * @param _client - The client attempting to authenticate
   * @param options - Connection options containing potential tokens
   * @param context - Request context containing headers and token
   * @returns Authentication context with user details
   * @throws Error if authentication fails
   */
  async authenticateInternal(_client: Client, options: unknown, context: { token?: string; headers?: Headers }) {
    const optionsObj = (options && typeof options === "object" ? (options as Record<string, unknown>) : {});
    // Extract token from multiple possible sources in order of preference
    const tokenFromHeader = context?.headers?.get("authorization") ?? optionsObj.authorization;
    const tokenFromContext = context?.token;
    const tokenFromOptions = optionsObj.token;
    const raw = tokenFromHeader ?? tokenFromContext ?? tokenFromOptions;
    const token = this.extractBearerToken(raw);

    if (!token) throw new Error("Missing Authorization bearer token.");

    // Validate the token with the authentication service
    const user = await AuthService.validateSession(token);
    if (!user) throw new Error("Invalid or expired session.");

    // Return the authentication context for the session
    return {
      userId: user.id,
      sessionId: token,
      roles: [user.role],
      username: user.username ?? user.displayName ?? `player_${user.id.slice(0, 6)}`,
    } as AuthContext;
  }

  /**
   * Called before state patches are applied to clients. Used to update
   * metadata and track when the table becomes active.
   * 
   * @param state - The new state that will be patched to clients
   */
  onBeforePatch(state: PokerState) {
    // Set runningSince timestamp when the first hand starts
    if (state.street !== "WAITING" && state.runningSinceTs === 0) {
      state.runningSinceTs = Date.now();
    }

    // Update metadata with runningSince timestamp if it changed
    const runningSince = state.runningSinceTs || undefined;
    const current = this.getMetadataSafe();
    if (current.runningSince !== runningSince) {
      void this.setMetadata({ ...current, runningSince, updatedAt: Date.now() });
    }
  }

  /**
   * Handles client joining the room. Manages authentication, seat recovery,
   * new player seating, and session binding. Supports multiple join modes:
   * - RESTORE: Reconnecting to existing seat
   * - REBOUND: Restoring from persistent session after disconnect
   * - NEW: First time joining the table
   * 
   * @param client - The client joining the room
   * @param options - Join options including buy-in amount
   * @param auth - Authentication context from onAuth
   */
  async handleJoinInternal(client: Client, options: JoinOptions, auth?: AuthContext) {
    return this.controllerRequired.join.handleJoin(client, options, auth);
  }

  /**
   * Handles client leaving the room. Manages session cleanup, reconnection
   * windows, bot removal, and persistent seat state updates.
   * 
   * Complex logic handles multiple scenarios:
   * - Stale sessions (user reconnected with new client)
   * - Consented leaves (intentional disconnect)
   * - Unintentional disconnects with reconnection window
   * - Abandoned seats after reconnection timeout
   * 
   * @param client - The client leaving the room
   * @param code - Close code indicating reason for disconnect
   */
  async handleLeaveInternal(client: Client, code?: number) {
    return this.controllerRequired.leave.handleLeave(client, code);
  }

  /**
   * Kicks a user from the table by admin request (e.g., ban).
   * Sends error message to the user's client and removes them from the table.
   * 
   * @param userId - The ID of the user to kick
   * @param reason - The reason for the kick (default: "BANNED")
   */
  async kickUserByAdmin(userId: string, reason: string = "BANNED") {
    const client = this.getBoundClient(userId);
    if (client) {
      try {
        this.sendTableMessage(client, "ERROR", { code: "KICKED", message: reason });
      } catch (err) {
        void err;
      }
      try {
        client.leave();
      } catch (err) {
        void err;
      }
    }
    await this.dealer.kickUser(userId, reason);
    // Mirror every other removal path (consented leave, abandon-timeout, sweep, TTL cleanup):
    // refresh counts and, if this was the last seated human, clear bots. kickUser only marks
    // the player ABANDONED (does not delete the seat), so this is usually a no-op for bot
    // clearing today, but keeps behavior consistent and correct once/if the seat is released.
    await this.maybeRemoveBotsIfNoHumans();
    this.updateMetadataCounts();
  }

  /**
   * Called remotely when the user is joining another table. A human may be seated at several
   * tables at once (separate tabs, or switching through the lobby), but only ever actively plays
   * one at a time. So this sits the player out here (seat + stack preserved, same as any other
   * sit-out) rather than cashing them out, and closes their connection with
   * LEAVE_CODE_SESSION_REPLACED so they do not reconnect to this table's session. They fall under
   * the normal sit-out/turn-timeout/abandoned-seat-purge rules from here if they never return.
   */
  async requestUserLeaveBecauseJoiningAnotherTable(userId: string): Promise<void> {
    if (!this.dealer.hasPlayer(userId)) return;
    const client = this.getBoundClient(userId);
    await this.dealer.setPlayerSittingOut(userId, true);
    this.dealer.unbindClient(userId);
    this.removeTablePresence(userId);
    if (this.persistentSeatsEnabled) {
      await TableSeatSessionService.markSittingOut({
        tableId: this.state.tableId,
        userId,
        stackCentsSnapshot: this.getPlayerStackCents(userId),
        handIdSnapshot: this.state.handId || undefined,
      });
    }
    if (client) {
      if (this.controller) {
        this.controller.session.deleteSession(client.sessionId);
        this.controller.session.deleteUserEpoch(userId);
      } else {
        this.userIdBySessionId.delete(client.sessionId);
        this.bindingEpochBySessionId.delete(client.sessionId);
        this.bindingEpochByUserId.delete(userId);
      }
      this.updateMetadataCounts();
      try {
        this.sendTableMessage(client, "ERROR", { code: "SESSION_REPLACED", message: "You joined another table." });
        client.leave(LEAVE_CODE_SESSION_REPLACED);
      } catch (err) {
        void err;
      }
    } else {
      this.updateMetadataCounts();
    }
    await this.reevaluateIdleLifecycle();
  }

  /**
   * Called after economy buy-in to add chips to a seated player.
   * Updates the player's stack and persists the new session state.
   * 
   * @param userId - The ID of the player receiving the rebuy
   * @param amountCents - Amount of chips to add in cents
   * @param rebuyRef - Optional reference for the rebuy transaction
   */
  async applyRebuy(userId: string, amountCents: number, rebuyRef?: string): Promise<void> {
    await this.withTableLifecycleReadLock(async () => {
      if (this.isDeleting) throw new Error("TABLE_GONE");
      await this.applyRebuyUnderLifecycleLock(userId, amountCents, rebuyRef);
    });
  }

  private async applyRebuyUnderLifecycleLock(userId: string, amountCents: number, rebuyRef?: string): Promise<void> {
    await this.dealer.applyRebuy(userId, amountCents, rebuyRef);
    if (this.persistentSeatsEnabled) {
      const seat = this.findPlayerSeat(userId);
      const stackCents = this.getPlayerStackCents(userId);
      if (seat !== null) {
        await TableSeatSessionService.upsertActiveSeat({
          tableId: this.state.tableId,
          userId,
          seat,
          stackCentsSnapshot: stackCents,
          buyInCents: amountCents,
          handIdSnapshot: this.state.handId || undefined,
        });
      }
    }
  }

  async applyTournamentRebuy(
    userId: string,
    displayName: string,
    amountCents: number,
    rebuyRef?: string,
  ): Promise<void> {
    await this.dealer.applyTournamentRebuy(userId, displayName, amountCents, rebuyRef);
    if (this.persistentSeatsEnabled) {
      const seat = this.findPlayerSeat(userId);
      const stackCents = this.getPlayerStackCents(userId);
      if (seat !== null) {
        await TableSeatSessionService.upsertActiveSeat({
          tableId: this.state.tableId,
          userId,
          seat,
          stackCentsSnapshot: stackCents,
          buyInCents: amountCents,
          handIdSnapshot: this.state.handId || undefined,
        });
      }
    }
  }

  private async processJoinBuyInForZeroStackSeat(userId: string, buyInCents: number): Promise<void> {
    const externalRef = `join_buyin_${this.state.tableId}_${userId}_${Date.now()}_${nanoid(6)}`;
    await CashierService.processCashGameBuyIn({
      userId,
      tableId: this.state.tableId,
      amountCents: buyInCents,
      externalRef,
      tableMeta: {
        name: this.state.tableName,
        creatorId: this.state.creatorId || undefined,
      },
    });
    await this.applyRebuyUnderLifecycleLock(userId, buyInCents, externalRef);
    logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId, buyInCents }, "POKER_JOIN_BUYIN_OVERRIDE_APPLIED");
  }

  /**
   * Seeds bots for an instant game preset directly on the server.
   * This is called via remoteRoomCall immediately after room creation
   * so that the first snapshot already includes the target bots.
   */
  async seedInstantBots(
    presetId: InstantGamePresetId,
    targetBotCountOverride?: number,
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }> {
    const presetTarget =
      presetId === "MULTIPLAYER_RING"
        ? 5
        : presetId === "HEADS_UP_BOT"
          ? 1
          : 0;
    const requestedTarget = typeof targetBotCountOverride === "number" ? targetBotCountOverride : presetTarget;
    const maxBotsForTable = Math.max(0, this.state.maxSeats - 1);
    const target = Math.max(0, Math.min(requestedTarget, maxBotsForTable));

    if (target <= 0) {
      return { ok: false, added: 0, target, reason: "INVALID_TARGET" };
    }

    let existingBots = 0;
    for (const player of this.state.playersById.values()) {
      if (player.kind === "BOT") existingBots += 1;
    }

    if (existingBots >= target) {
      return { ok: true, added: 0, target };
    }

    const summaries = listEnabledBotSummaries();
    if (summaries.length === 0) {
      logger.warn(
        { roomId: this.roomId, tableId: this.state.tableId, presetId },
        "INSTANT_BOT_SEED_NO_ENABLED_BOTS",
      );
      return { ok: false, added: 0, target, reason: "NO_ENABLED_BOTS" };
    }

    const missing = target - existingBots;
    let added = 0;
    const buyInCents =
      this.state.minBuyInCents > 0
        ? this.state.minBuyInCents
        : this.state.bigBlindCents * 20;

    this.logInstantGameMemoryPhase("seed_start", {
      presetId,
      target,
      existingBots,
      missing,
    });

    this.dealer.suspendGameplayTransitions("INSTANT_BOT_SEED");
    try {
      for (let i = 0; i < missing; i += 1) {
        const summary = summaries[i % summaries.length];
        const runtimeBotId = newBotId();
        const botName = summary.name ?? `Bot ${summary.id}`;
        try {
          this.logInstantGameMemoryPhase("before_add_bot", {
            presetId,
            target,
            botIndex: i,
            botCatalogId: summary.id,
          });
          await this.dealer.addBot(runtimeBotId, botName, buyInCents, summary.id, { inertDuringSeed: true });
          added += 1;
          this.logInstantGameMemoryPhase("after_add_bot", {
            presetId,
            target,
            botIndex: i,
            botCatalogId: summary.id,
            added,
          });
        } catch (err: unknown) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              presetId,
              botId: summary.id,
              message: (err as Error | undefined)?.message ?? String(err),
            },
            "INSTANT_BOT_SEED_ADD_FAILED",
          );
        }
      }

      if (added > 0) {
        this.updateMetadataCounts();
        this.logInstantGameMemoryPhase("before_seed_snapshot", {
          presetId,
          target,
          added,
        });
        await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
        this.logInstantGameMemoryPhase("after_seed_snapshot", {
          presetId,
          target,
          added,
        });
      }
    } finally {
      this.dealer.resumeGameplayTransitions("INSTANT_BOT_SEED");
    }

    if (added > 0) {
      this.dealer.maybeActForBotPublic();
      this.logInstantGameMemoryPhase("after_seed_drive_kick", {
        presetId,
        target,
        added,
      });
    }

    return { ok: added === missing, added, target };
  }

  async seedTournamentPlayers(
    seats: { userId: string; displayName: string }[],
    startingStackCents: number,
    tournamentId: string,
  ): Promise<{ ok: boolean; seated: number }> {
    if (!this.tournamentId || this.tournamentId !== tournamentId) {
      return { ok: false, seated: 0 };
    }

    let seated = 0;
    this.dealer.suspendGameplayTransitions("TOURNAMENT_SEED");
    try {
      for (const seat of seats) {
        if (this.dealer.hasPlayer(seat.userId)) {
          seated += 1;
          continue;
        }
        try {
          await this.dealer.addTournamentPlayer(
            seat.userId,
            seat.displayName,
            startingStackCents,
            tournamentId,
            tournamentSeatGrantExternalRef(tournamentId, seat.userId),
          );
          seated += 1;
        } catch (err: unknown) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              tournamentId,
              userId: seat.userId,
              message: (err as Error | undefined)?.message ?? String(err),
            },
            "TOURNAMENT_SEED_PLAYER_FAILED",
          );
        }
      }
      if (seated > 0) {
        this.updateMetadataCounts();
        await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
      }
    } finally {
      this.dealer.resumeGameplayTransitions("TOURNAMENT_SEED");
    }

    return { ok: seated >= 1, seated };
  }

  async seedTournamentBots(
    seats: { userId: string; displayName: string; catalogBotId: string }[],
    startingStackCents: number,
    tournamentId: string,
  ): Promise<{ ok: boolean; seated: number }> {
    if (!this.tournamentId || this.tournamentId !== tournamentId) {
      return { ok: false, seated: 0 };
    }

    let seated = 0;
    this.dealer.suspendGameplayTransitions("TOURNAMENT_BOT_SEED");
    try {
      for (const seat of seats) {
        if (this.dealer.hasPlayer(seat.userId)) {
          seated += 1;
          continue;
        }
        try {
          await this.dealer.addTournamentBotPlayer(
            seat.userId,
            seat.displayName,
            seat.catalogBotId,
            startingStackCents,
            tournamentId,
            tournamentSeatGrantExternalRef(tournamentId, seat.userId),
            { inertDuringSeed: true },
          );
          seated += 1;
        } catch (err: unknown) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              tournamentId,
              userId: seat.userId,
              catalogBotId: seat.catalogBotId,
              message: (err as Error | undefined)?.message ?? String(err),
            },
            "TOURNAMENT_SEED_BOT_FAILED",
          );
        }
      }
      if (seated > 0) {
        this.updateMetadataCounts();
        await this.emitSnapshotsToAllSafe("SEAT_CHANGE");
      }
    } finally {
      this.dealer.resumeGameplayTransitions("TOURNAMENT_BOT_SEED");
    }

    return { ok: seated > 0, seated };
  }

  /**
   * Called when the room is being disposed. Performs comprehensive cleanup:
   * - Stops disconnect sweep timers
   * - Resets session statistics
   * - Removes event listeners
   * - Cleans up player presence
   * - Clears all tracking maps
   */
  onDispose() {
    if (this.controller) {
      this.controller.lifecycle.dispose();
      return;
    }
    this.disposeInternal();
  }

  disposeInternal() {
    this.isDeleting = true;
    
    // Clean up idle disposal timer
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
    }
    if (this.stallCheckInterval) {
      clearInterval(this.stallCheckInterval);
      this.stallCheckInterval = null;
    }

    // Log room disposal for debugging
    logger.warn(
      {
        roomId: this.roomId,
        tableId: this.state?.tableId,
        autoDispose: this.autoDispose,
        clientCount: this.clients?.length ?? 0,
      },
      "POKER_ROOM_DISPOSED",
    );
    
    // Clean up dealer and session management
    this.dealer.dispose();
    this.unbindSessionEvent?.();
    this.unbindSessionEvent = undefined;
    
    // Remove all player presence from lobby
    const trackedUserIds = this.controller ? this.controller.session.valuesUserIds() : this.userIdBySessionId.values();
    for (const userId of trackedUserIds) {
      this.removeTablePresence(userId);
    }
    
    // Clear all tracking maps to prevent memory leaks
    if (this.controller) this.controller.session.clearAll();
    else {
      this.userIdBySessionId.clear();
      this.bindingEpochBySessionId.clear();
      this.bindingEpochByUserId.clear();
    }
    this.lastAcceptedActionByUserId.clear();
  }

  /**
   * Extracts bearer token from authorization header or raw token.
   * Handles both "Bearer token" format and raw token strings.
   * 
   * @param raw - The raw token string from headers or options
   * @returns The extracted token or null if invalid
   */
  private extractBearerToken(raw: unknown): string | null {
    if (typeof raw !== "string" || raw.length === 0) return null;
    if (raw.startsWith("Bearer ")) return raw.slice(7).trim();
    return raw.trim();
  }

  /**
   * Sends a validated message to a client. Ensures the message
   * conforms to the outbound message schema before sending.
   * 
   * @param client - The client to send the message to
   * @param type - The message type
   * @param payload - The message payload
   */
  private sendTableMessage(client: { send: (type: string, payload: unknown) => void }, type: string, payload: unknown) {
    const parsed = TableOutboundMessageSchema.safeParse({ type, payload });
    if (!parsed.success) {
      logger.warn({ room: "poker", roomId: this.roomId, type, errors: parsed.error.flatten() }, "Dropping invalid poker outbound message");
      return;
    }
    client.send(parsed.data.type, parsed.data.payload);
  }

  /**
   * Finds the seat number for a given user ID.
   * 
   * @param userId - The user ID to search for
   * @returns The seat number or null if user not found
   */
  private findPlayerSeat(userId: string): number | null {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return player.seat;
    }
    return null;
  }

  /**
   * Gets basic player information for a given user ID.
   * 
   * @param userId - The user ID to search for
   * @returns Player info or null if user not found
   */
  private getPlayerByUserId(userId: string): { id: string; kind: string; name: string; botId: string } | null {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return { id: player.id, kind: player.kind, name: player.name, botId: player.botId };
    }
    return null;
  }

  /**
   * Gets the current chip stack amount for a given user ID.
   * 
   * @param userId - The user ID to search for
   * @returns The stack amount in cents (0 if user not found)
   */
  private getPlayerStackCents(userId: string): number {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return player.stackCents;
    }
    return 0;
  }

  /**
   * Exclusively binds a client to a user, replacing any existing client.
   * Updates binding epochs to track the latest connection and prevent
   * race conditions with stale connections.
   * 
   * @param userId - The user ID to bind the client to
   * @param client - The client to bind
   */
  private rebindClientExclusive(userId: string, client: Client): void {
    if (!this.controller) {
      this.dealer.bindClient(userId, client);
      this.userIdBySessionId.set(client.sessionId, userId);
      const nextEpoch = (this.bindingEpochByUserId.get(userId) ?? 0) + 1;
      this.bindingEpochByUserId.set(userId, nextEpoch);
      this.bindingEpochBySessionId.set(client.sessionId, nextEpoch);
      return;
    }
    this.controller.session.rebindClientExclusive(userId, client);
  }

  private logRestoreBindOk(userId: string, sessionId: string): void {
    logger.info(
      {
        roomId: this.roomId,
        tableId: this.state.tableId,
        userId,
        sessionId,
        epoch: this.controller ? this.controller.session.getBindingEpochForUser(userId) : this.bindingEpochByUserId.get(userId),
      },
      "POKER_RESTORE_BIND_OK",
    );
  }

  /**
   * Validates that a binding epoch is still current for the given user.
   * Used to detect and ignore operations from stale connections.
   * 
   * @param userId - The user ID to check
   * @param leaveBindingEpoch - The epoch to validate against
   * @returns True if the epoch is current, false otherwise
   */
  private isBindingEpochCurrent(userId: string, leaveBindingEpoch?: number): boolean {
    if (!this.controller) {
      if (typeof leaveBindingEpoch !== "number") return !this.bindingEpochByUserId.has(userId);
      return this.bindingEpochByUserId.get(userId) === leaveBindingEpoch;
    }
    return this.controller.session.isBindingEpochCurrent(userId, leaveBindingEpoch);
  }

  /**
   * Adds a user's presence to the lobby system for discovery.
   * Only adds presence if the client is authenticated for the user.
   * 
   * @param client - The client to add presence for
   * @param userId - The user ID to add presence for
   * @param displayName - Optional display name for the user
   */
  private addTablePresence(client: Client, userId: string, displayName?: string): void {
    const authedUserId = client.auth?.userId;
    if (!authedUserId || authedUserId !== userId) return;
    presenceIndex.add(
      userId,
      { kind: "TABLE", tableId: this.state.tableId, tableName: this.state.tableName },
      displayName,
    );
  }

  /**
   * Removes a user's presence from the lobby system.
   * Called when a user leaves or disconnects from the table.
   * 
   * @param userId - The user ID to remove presence for
   */
  private removeTablePresence(userId: string): void {
    if (!userId) return;
    presenceIndex.remove(userId, { kind: "TABLE", tableId: this.state.tableId, tableName: this.state.tableName });
  }

  /**
   * Safely marks a user as disconnected, handling both sync and async
   * dealer implementations. Uses type checking to determine the available method.
   * 
   * @param userId - The user ID to mark as disconnected
   * @param disconnectDeadlineTs - Timestamp when the disconnect window expires
   */
  private async markDisconnectedSafe(userId: string, disconnectDeadlineTs: number): Promise<void> {
    const dealer = this.dealer as unknown as {
      markDisconnectedSerialized?: (id: string, ts: number) => Promise<void>;
      markDisconnected: (id: string, ts: number) => void;
    };
    if (typeof dealer.markDisconnectedSerialized === "function") {
      await dealer.markDisconnectedSerialized(userId, disconnectDeadlineTs);
      return;
    }
    dealer.markDisconnected(userId, disconnectDeadlineTs);
  }

  /**
   * Safely marks a user as reconnected, handling both sync and async
   * dealer implementations. Uses type checking to determine the available method.
   * 
   * @param userId - The user ID to mark as reconnected
   */
  private async markReconnectedSafe(userId: string): Promise<boolean> {
    const dealer = this.dealer as unknown as {
      markReconnectedSerialized?: (id: string) => Promise<boolean>;
      markReconnected: (id: string) => void;
    };
    if (typeof dealer.markReconnectedSerialized === "function") {
      return dealer.markReconnectedSerialized(userId);
    }
    dealer.markReconnected(userId);
    return true;
  }

  private async clearSittingOutOnRestoreSafe(userId: string): Promise<void> {
    const dealer = this.dealer as unknown as {
      setPlayerSittingOut?: (id: string, sittingOut: boolean) => Promise<void>;
    };
    if (typeof dealer.setPlayerSittingOut !== "function") return;
    try {
      await dealer.setPlayerSittingOut(userId, false);
    } catch (err) {
      logger.warn(
        { roomId: this.roomId, tableId: this.state.tableId, userId, message: (err as Error)?.message ?? String(err) },
        "POKER_RESTORE_CLEAR_SIT_OUT_FAILED",
      );
    }
  }

  /**
   * Safely marks a user as abandoned, handling both sync and async
   * dealer implementations. Used when a user fails to reconnect within the window.
   * 
   * @param userId - The user ID to mark as abandoned
   */
  private async markAbandonedSafe(userId: string, expectedDisconnectDeadlineTs?: number): Promise<void> {
    if (this.tournamentId) {
      logger.info(
        { roomId: this.roomId, tableId: this.state.tableId, tournamentId: this.tournamentId, userId },
        "TOURNAMENT_DISCONNECT_TIMEOUT_PRESERVED_AS_GHOST_STACK",
      );
      return;
    }
    const dealer = this.dealer as unknown as {
      markAbandonedSerialized?: (id: string, expectedDeadlineTs?: number) => Promise<boolean>;
      markAbandoned: (id: string) => Promise<void>;
    };
    if (typeof dealer.markAbandonedSerialized === "function") {
      await dealer.markAbandonedSerialized(userId, expectedDisconnectDeadlineTs);
      return;
    }
    await dealer.markAbandoned(userId);
  }

  private async emitSnapshotsToAllSafe(reason: string): Promise<void> {
    const dealerAny = this.dealer as unknown as {
      emitSnapshotsToAll?: (snapshotReason: string) => Promise<void>;
    };
    if (typeof dealerAny.emitSnapshotsToAll !== "function") return;
    await dealerAny.emitSnapshotsToAll(reason);
  }

  /**
   * Gets the currently bound client for a user ID.
   * Uses type checking to safely access the dealer's getClient method.
   * 
   * @param userId - The user ID to get the client for
   * @returns The bound client or undefined if not found
   */
  private getBoundClient(userId: string): Client | undefined {
    if (!this.controller) {
      const dealerAny = this.dealer as unknown as { getClient?: (id: string) => Client | undefined };
      if (typeof dealerAny.getClient !== "function") return undefined;
      return dealerAny.getClient(userId);
    }
    return this.controller.session.getBoundClient(userId);
  }

  /**
   * Checks if a client is the currently active bound client for a user.
   * Prevents actions from stale connections that have been replaced.
   * 
   * @param userId - The user ID to check
   * @param client - The client to validate
   * @returns True if the client is active and bound, false otherwise
   */
  private isActiveBoundClient(userId: string, client: Client): boolean {
    if (!this.controller) {
      const boundClient = this.getBoundClient(userId);
      return !boundClient || boundClient.sessionId === client.sessionId;
    }
    return this.controller.session.isActiveBoundClient(userId, client);
  }

  /**
   * Normalizes action payload to handle different message formats.
   * Extracts actionId from various locations and normalizes the payload structure.
   * Ensures idempotency by requiring a valid actionId.
   * 
   * @param payload - The raw action payload to normalize
   * @returns Normalized payload with actionId or null if invalid
   */
  private normalizeActionPayload(payload: unknown): { payload: unknown; actionId: string; handId?: string } | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const candidate = payload as Record<string, unknown>;
    const payloadRecord = candidate.payload as Record<string, unknown> | undefined;
    const payloadActionId = payloadRecord?.actionId;
    const payloadHandId = payloadRecord?.handId;
    const handId: string | undefined =
      typeof candidate.handId === "string"
        ? candidate.handId
        : candidate.payload !== undefined && typeof payloadHandId === "string"
          ? payloadHandId
          : undefined;
    const actionId: string | undefined =
      typeof candidate.actionId === "string"
        ? candidate.actionId
        : candidate.payload !== undefined && typeof payloadActionId === "string"
          ? payloadActionId
          : undefined;
    if (candidate.payload !== undefined) {
      if (typeof actionId !== "string" || actionId.length < 1) return null;
      return { payload: candidate.payload, actionId, handId };
    }
    const { actionId: embedded, handId: embeddedHandId, ...rest } = candidate;
    if (typeof embedded !== "string" || embedded.length < 1) return null;
    return {
      payload: rest,
      actionId: embedded,
      handId: typeof embeddedHandId === "string" ? embeddedHandId : undefined,
    };
  }

  /**
   * Executes a function with a join lock to prevent race conditions.
   * Ensures that multiple join attempts for the same user are serialized.
   * 
   * @param key - The lock key (format: "tableId:userId")
   * @param fn - The function to execute within the lock
   */
  private async withJoinLock(key: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.joinLocksByKey.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const tracked = next.then(
      () => undefined,
      () => undefined,
    );
    this.joinLocksByKey.set(key, tracked);
    try {
      await next;
    } finally {
      if (this.joinLocksByKey.get(key) === tracked) {
        this.joinLocksByKey.delete(key);
      }
    }
  }

  private lifecycleWakeWaiters(): void {
    const queue = this.lifecycleWaitQueue;
    if (queue.length === 0) return;
    this.lifecycleWaitQueue = [];
    for (const resolve of queue) resolve();
  }

  private async lifecycleAcquireRead(): Promise<void> {
    // Writer-preference: once a writer is *queued* (not just once it's active), new readers must
    // stop entering immediately -- checking only lifecycleWriterActive here would let a steady
    // stream of readers arriving faster than they drain keep readerCount above zero forever,
    // starving the writer, which never gets to flip writerActive true in the first place.
    while (this.lifecycleWriterActive || this.lifecycleWritersWaiting > 0) {
      await new Promise<void>((resolve) => this.lifecycleWaitQueue.push(resolve));
    }
    this.lifecycleReaderCount += 1;
  }

  private lifecycleReleaseRead(): void {
    this.lifecycleReaderCount -= 1;
    if (this.lifecycleReaderCount === 0) this.lifecycleWakeWaiters();
  }

  private async lifecycleAcquireWrite(): Promise<void> {
    this.lifecycleWritersWaiting += 1;
    try {
      while (this.lifecycleWriterActive || this.lifecycleReaderCount > 0) {
        await new Promise<void>((resolve) => this.lifecycleWaitQueue.push(resolve));
      }
    } finally {
      this.lifecycleWritersWaiting -= 1;
    }
    this.lifecycleWriterActive = true;
  }

  private lifecycleReleaseWrite(): void {
    this.lifecycleWriterActive = false;
    this.lifecycleWakeWaiters();
  }

  /** Cheap hot path: joins, reconnects, and economic admission run concurrently with each other. */
  private async withTableLifecycleReadLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.lifecycleAcquireRead();
    try {
      return await fn();
    } finally {
      this.lifecycleReleaseRead();
    }
  }

  /** Cold path: the final disposal decision needs exclusive access. */
  private async withTableLifecycleWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.lifecycleAcquireWrite();
    try {
      return await fn();
    } finally {
      this.lifecycleReleaseWrite();
    }
  }

  /**
   * Begin a buy-in/rebuy admission for userId, identified by a deterministic token (the rebuy's
   * externalRef). Held for the *entire* window from before the CashierService DB commit (in
   * EconomyRouter) through the room-side applyRebuy/addPlayer sync -- not just around the room
   * mutation -- so a concurrent /cash-out for the same user can see "this user has money in
   * flight" even while they are not yet seated, and refuse to race the buy-in to zero.
   */
  async beginEconomicAdmission(userId: string, token: string): Promise<{ ok: boolean; reason?: string }> {
    return this.withTableLifecycleReadLock(async () => {
      if (this.isDeleting) return { ok: false, reason: "TABLE_GONE" };
      if (this.cashOutAdmissionUsers.has(userId)) return { ok: false, reason: "CASHOUT_IN_PROGRESS" };
      const userTokens = this.buyInAdmissionsByUser.get(userId) ?? new Map<string, number>();
      userTokens.set(token, (userTokens.get(token) ?? 0) + 1);
      this.buyInAdmissionsByUser.set(userId, userTokens);
      this.cancelIdleDispose();
      return { ok: true };
    });
  }

  /**
   * Called via matchMaker.remoteRoomCall (same cross-process pattern as beginEconomicAdmission)
   * from PlayerInteractionService.resolveSideBetsForHand's two callers: the hand-end hook (this
   * room, same process — still routed through remoteRoomCall for one code path) and the global
   * reconciliation sweep in index.ts, which has no room reference at all and must look this
   * table's live room up by tableId first. A no-op if the table isn't currently live (nothing to
   * notify) — the resolution itself already happened and is durable in the DB regardless.
   */
  async broadcastSideBetResolved(
    results: { interactionId: string; catalogKey: string; winnerId: string | null; payoutCents: number; resolutionNote: string }[],
  ): Promise<void> {
    for (const result of results) {
      this.clients.forEach((c) => this.sendTableMessageInternal(c, "SIDE_BET_RESOLVED", result));
    }
  }

  async endEconomicAdmission(userId: string, token: string): Promise<void> {
    await this.withTableLifecycleReadLock(async () => {
      const userTokens = this.buyInAdmissionsByUser.get(userId);
      if (!userTokens) return;
      const count = userTokens.get(token) ?? 0;
      if (count <= 1) userTokens.delete(token);
      else userTokens.set(token, count - 1);
      if (userTokens.size === 0) this.buyInAdmissionsByUser.delete(userId);
    });
    void this.reevaluateIdleLifecycle();
  }

  /**
   * Begin a cash-out admission for userId, used by EconomyRouter's /cash-out endpoint (via
   * remoteRoomCall) *before* touching CashierService. Rejects if the user is currently seated
   * (cash-out for a seated/in-hand player must go through the poker lifecycle, not bypass it --
   * the room's in-memory stack is only a mirror of PlayerBalance synced at specific touchpoints,
   * so an out-of-band debit while seated can desync it and surface as a mid-hand
   * INSUFFICIENT_BALANCE failure), if a buy-in/rebuy admission is in flight for this user (money
   * already committed to PlayerBalance but not yet synced to room state -- see
   * beginEconomicAdmission), or if another cash-out is already in flight for this user.
   */
  async beginCashOutAdmission(userId: string): Promise<{ ok: boolean; reason?: string }> {
    return this.withTableLifecycleReadLock(async () => {
      if (this.isDeleting) return { ok: false, reason: "TABLE_GONE" };
      if (this.isUserSeated(userId)) return { ok: false, reason: "SEATED_AT_TABLE" };
      if (this.buyInAdmissionsByUser.has(userId)) return { ok: false, reason: "ADMISSION_IN_PROGRESS" };
      if (this.cashOutAdmissionUsers.has(userId)) return { ok: false, reason: "CASHOUT_IN_PROGRESS" };
      this.cashOutAdmissionUsers.add(userId);
      this.cancelIdleDispose();
      return { ok: true };
    });
  }

  async endCashOutAdmission(userId: string): Promise<void> {
    await this.withTableLifecycleReadLock(async () => {
      this.cashOutAdmissionUsers.delete(userId);
    });
    void this.reevaluateIdleLifecycle();
  }

  /**
   * Read-only check of whether the live room currently has userId seated. Also used directly by
   * beginCashOutAdmission above.
   */
  isUserSeated(userId: string): boolean {
    const player = this.state.playersById.get(userId);
    return Boolean(player) && player!.kind === "HUMAN";
  }

  /**
   * Runs cleanup for expired persistent seat sessions.
   * Removes players who have been disconnected too long and processes
   * automatic cashouts for abandoned chip stacks.
   */
  private async runPersistentSeatCleanup(): Promise<void> {
    if (this.isDeleting) return;
    if (!this.persistentSeatsEnabled) return;
    
    // Get retention periods from configuration
    const retentionHours = getSeatRetentionHours();
    const hardDeleteHours = getSeatHardDeleteHours();
    
    // Reap expired sessions for this table
    const reap = await TableSeatSessionService.reapExpiredSessionsForTable({
      tableId: this.state.tableId,
      retentionHours,
      hardDeleteHours,
    });
    
    if (reap.softExpired.length === 0 && reap.hardDeletedCount === 0) return;

    // Process each expired session
    for (const session of reap.softExpired) {
      const userId = session.userId;
      
      // If user is still at table, remove them if they're not connected
      if (this.dealer.hasPlayer(userId)) {
        const connected = this.isPlayerConnected(userId);
        if (connected) {
          logger.warn({ roomId: this.roomId, tableId: this.state.tableId, userId }, "SEAT_TTL_SKIP_CONNECTED");
          continue;
        }
        try {
          await this.dealer.removePlayer(userId);
          await this.maybeRemoveBotsIfNoHumans();
          this.updateMetadataCounts();
        } catch (err: unknown) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              userId,
              message: err instanceof Error ? err.message : String(err),
            },
            "SEAT_TTL_REMOVE_PLAYER_FAILED",
          );
        }
        continue;
      }

      // Process automatic cashout for abandoned chips
      if (session.stackCentsSnapshot <= 0) continue;
      const externalRef = `ttl_cashout_${this.state.tableId}_${userId}_${session.id}`;
      try {
        await CashierService.processCashGameCashOut({
          userId,
          tableId: this.state.tableId,
          amountCents: session.stackCentsSnapshot,
          externalRef,
          tableMeta: {
            name: this.state.tableName,
          },
        });
      } catch (err: unknown) {
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            externalRef,
            message: err instanceof Error ? err.message : String(err),
          },
          "SEAT_TTL_CASHOUT_FAILED",
        );
      }
    }

    logger.info(
      {
        roomId: this.roomId,
        tableId: this.state.tableId,
        softExpiredCount: reap.softExpired.length,
        hardDeletedCount: reap.hardDeletedCount,
        retentionHours,
        hardDeleteHours,
      },
      "SEAT_TTL_REAP",
    );
  }

  /**
   * Checks if a player has a bound client (is connected).
   * 
   * @param userId - The user ID to check
   * @returns True if the player is connected, false otherwise
   */
  private isPlayerConnected(userId: string): boolean {
    return Boolean(this.getBoundClient(userId));
  }

  /**
   * Counts the total number of human players at the table,
   * including both connected and disconnected players.
   * 
   * @returns The number of human players
   */
  private computeHumanCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.kind !== "BOT") n++;
    }
    return n;
  }

  /**
   * Counts humans who have a bound client (binding map is source of truth, not PlayerState.connected).
   * This is the authoritative count of currently connected human players.
   */
  private computeConnectedHumanCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.kind !== "BOT" && this.getBoundClient(p.id)) n++;
    }
    return n;
  }

  private computeSeatedCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.status !== "OUT") n++;
    }
    return n;
  }

  /**
   * Safely gets room metadata, handling potential errors.
   * 
   * @returns The room metadata or empty object if unavailable
   */
  private getMetadataSafe(): Partial<PokerRoomMetadata> {
    try {
      return this.metadata ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Updates room metadata with current player counts.
   * Called whenever player counts change to keep lobby in sync.
   */
  private updateMetadataCounts(): void {
    const humanCount = this.computeHumanCount();
    const connectedHumanCount = this.computeConnectedHumanCount();
    const seatedCount = this.computeSeatedCount();
    const current = this.getMetadataSafe();
    if (
      current.humanCount !== humanCount ||
      current.connectedHumanCount !== connectedHumanCount ||
      current.seatedCount !== seatedCount
    ) {
      void this.setMetadata({
        ...current,
        humanCount,
        connectedHumanCount,
        seatedCount,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Remove all bots when zero seated humans remain (humanCount === 0, not connectedHumanCount).
   * This prevents bots from playing at empty tables and saves resources.
   */
  private async maybeRemoveBotsIfNoHumans(): Promise<void> {
    // Important: computeHumanCount includes disconnected/sitting-out seated humans.
    // As long as any human still has a seat, do not auto-remove bots.
    if (this.computeHumanCount() !== 0) return;
    // Avoid lifecycle/remove races while a hand is still active.
    if (this.state.street !== "WAITING") return;
    
    // Find and remove all bots
    const botIds = [...this.state.playersById.values()].filter((p) => p.kind === "BOT").map((p) => p.id);
    for (const botId of botIds) {
      try {
        await this.dealer.removeBot(botId);
      } catch (err) {
        logger.warn(
          { roomId: this.roomId, tableId: this.state.tableId, botId, message: (err as Error)?.message ?? String(err) },
          "maybeRemoveBots removeBot failed",
        );
      }
    }
    if (botIds.length > 0) this.updateMetadataCounts();
    await this.reevaluateIdleLifecycle();
  }

  /**
   * Updates the last activity timestamp for the room.
   * Used for idle detection and automatic disposal.
   */
  private touchActivity(): void {
    this.lastActiveAtTs = Date.now();
  }

  private cancelIdleDispose(): void {
    this.idleEvaluationGeneration += 1;
    this.idleTimerGeneration += 1;
    this.emptySinceTs = null;
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
    }
  }

  /**
   * Idle disposal may only destroy a cash table already proven economically
   * empty. It never cashes players out or expires their ownership as a side effect.
   */
  private async canIdleDispose(): Promise<boolean> {
    if (this.isDeleting || this.state.tournamentMode) return false;
    if (this.buyInAdmissionsByUser.size !== 0 || this.cashOutAdmissionUsers.size !== 0) return false;
    if (this.computeConnectedHumanCount() !== 0) return false;
    if (this.computeHumanCount() !== 0) return false;
    if (this.state.street !== "WAITING") return false;

    try {
      const prisma = getPrisma() as any;
      const [reconnectableSessionCount, activeBalanceCount] = await Promise.all([
        TableSeatSessionService.countReconnectableSessionsForTable(this.state.tableId),
        prisma.playerBalance.count({
          where: { tableId: this.state.tableId, status: "ACTIVE", balanceCents: { gt: 0 } },
        }),
      ]);
      return reconnectableSessionCount === 0 && activeBalanceCount === 0;
    } catch (err) {
      logger.warn(
        { roomId: this.roomId, tableId: this.state.tableId, message: (err as Error)?.message ?? String(err) },
        "POKER_ROOM_IDLE_CHECK_FAILED_CLOSED",
      );
      return false;
    }
  }

  private async reevaluateIdleLifecycle(): Promise<void> {
    const evaluationGeneration = ++this.idleEvaluationGeneration;

    // Cancel synchronously on common active-state transitions so an old callback
    // cannot win while the durable checks are in flight.
    if (
      this.isDeleting ||
      this.state.tournamentMode ||
      this.computeConnectedHumanCount() !== 0 ||
      this.computeHumanCount() !== 0 ||
      this.state.street !== "WAITING"
    ) {
      this.cancelIdleDispose();
      return;
    }

    if (!(await this.canIdleDispose()) || evaluationGeneration !== this.idleEvaluationGeneration) {
      if (evaluationGeneration === this.idleEvaluationGeneration) this.cancelIdleDispose();
      return;
    }
    if (this.idleDisposeTimer) return;

    this.emptySinceTs = Date.now();
    const timerGeneration = ++this.idleTimerGeneration;
    this.idleDisposeTimer = setTimeout(() => {
      void this.handleIdleDisposeTimer(timerGeneration);
    }, this.IDLE_DISPOSE_MS);
  }

  private async handleIdleDisposeTimer(timerGeneration: number): Promise<void> {
    if (timerGeneration !== this.idleTimerGeneration) return;
    this.idleDisposeTimer = null;
    await this.withTableLifecycleWriteLock(async () => {
      if (timerGeneration !== this.idleTimerGeneration || !(await this.canIdleDispose())) {
        this.cancelIdleDispose();
        return;
      }
      const now = Date.now();
      logger.info(
        { roomId: this.roomId, tableId: this.state.tableId, idleMs: this.emptySinceTs == null ? 0 : now - this.emptySinceTs },
        "POKER_ROOM_IDLE_DISPOSE",
      );
      await this.requestDisconnectUnderLifecycleLock();
    });
  }

  /**
   * Requests the room to disconnect and dispose.
   * Validates that no humans are connected before proceeding.
   * Notifies all clients and initiates disconnection.
   */
  async requestDisconnect(): Promise<void> {
    await this.withTableLifecycleWriteLock(() => this.requestDisconnectUnderLifecycleLock());
  }

  private async requestDisconnectUnderLifecycleLock(): Promise<void> {
    const connectedHumanCount = this.computeConnectedHumanCount();
    if (connectedHumanCount !== 0) {
      throw new Error(`DELETE_INVARIANT_FAILED: connectedHumanCount=${connectedHumanCount}`);
    }
    this.isDeleting = true;
    
    // Remove all bots before disconnecting
    this.purgeBotsForDelete();
    this.updateMetadataCounts();
    
    // Notify all clients that the table is gone
    const payload = { version: 1 as const, code: "TABLE_GONE" as const, message: "Table no longer exists" };
    this.clients.forEach((c) => {
      try {
        this.sendTableMessage(c, "ERROR", payload);
      } catch (err) {
        logger.warn(
          { roomId: this.roomId, sessionId: c.sessionId, message: (err as Error)?.message ?? String(err) },
          "requestDisconnect sendTableMessage failed",
        );
      }
    });
    this.disconnect();
  }

  /**
   * Force-closes the table by admin request. Unlike requestDisconnect(), this
   * does not require humans to already be disconnected: it forcibly kicks
   * every seated human player first (reusing the same per-user kick path used
   * for admin bans/kicks, which cashes the player out via dealer.kickUser),
   * then purges bots and disconnects/disposes the room.
   *
   * @param reason - The reason surfaced to kicked clients (default: "ADMIN_CLOSED")
   * @returns The userIds of the human players that were kicked as part of the close.
   */
  // Invoked dynamically via matchMaker.remoteRoomCall (AdminService.closeTable), same pattern as kickUserByAdmin below.
  // fallow-ignore-next-line unused-class-member
  async closeTableByAdmin(reason: string = "ADMIN_CLOSED"): Promise<{ kickedUserIds: string[] }> {
    this.isDeleting = true;

    const humanUserIds = [...this.state.playersById.values()]
      .filter((player) => player.kind !== "BOT")
      .map((player) => player.id);

    for (const userId of humanUserIds) {
      await this.kickUserByAdmin(userId, reason);
    }

    this.purgeBotsForDelete();
    this.updateMetadataCounts();

    const payload = { version: 1 as const, code: "TABLE_GONE" as const, message: "Table closed by admin" };
    this.clients.forEach((c) => {
      try {
        this.sendTableMessage(c, "ERROR", payload);
      } catch (err) {
        logger.warn(
          { roomId: this.roomId, sessionId: c.sessionId, message: (err as Error)?.message ?? String(err) },
          "closeTableByAdmin sendTableMessage failed",
        );
      }
    });

    this.disconnect();
    return { kickedUserIds: humanUserIds };
  }

  /**
   * Terminal delete-path cleanup: bots are synthetic and can be dropped immediately.
   * Removes all bots from the table and clears their seats without going through
   * the normal bot removal flow.
   */
  private purgeBotsForDelete(): void {
    for (const player of [...this.state.playersById.values()]) {
      if (player.kind !== "BOT") continue;
      // Clear the seat and remove the bot from state
      if (player.seat >= 0 && player.seat < this.state.seats.length) {
        this.state.seats[player.seat] = "";
      }
      this.state.playersById.delete(player.id);
    }
  }

  /**
   * Begins the deletion process if no humans are connected.
   * Used by external systems to safely delete tables.
   * 
   * @returns Object indicating if deletion can proceed and why
   */
  beginDeleteIfNoConnectedHumans(): { ok: boolean; connectedHumanCount: number; reason?: string } {
    if (this.isDeleting) {
      return { ok: false, connectedHumanCount: this.computeConnectedHumanCount(), reason: "ALREADY_DELETING" };
    }
    const connectedHumanCount = this.computeConnectedHumanCount();
    if (connectedHumanCount !== 0) {
      return { ok: false, connectedHumanCount, reason: "CONNECTED_HUMANS_PRESENT" };
    }
    this.isDeleting = true;
    return { ok: true, connectedHumanCount: 0 };
  }

  /**
   * Cancels the deletion process.
   * Called when deletion needs to be aborted.
   */
  cancelDelete(): void {
    this.isDeleting = false;
  }

  /**
   * Bootstraps persistent seat recovery on room creation.
   * Restores player sessions that survived server restarts.
   * Handles schema version mismatches by cashing out players.
   */
  private async bootstrapPersistentSeatRecovery(): Promise<void> {
    if (!this.persistentSeatsEnabled) return;
    
    // Get retention period and find restorable sessions
    const retentionHours = getSeatRetentionHours();
    const sessions = await TableSeatSessionService.listRestorableSessionsForTable({
      tableId: this.state.tableId,
      retentionHours,
    });
    if (sessions.length === 0) return;

    for (const session of sessions) {
      // Handle schema version mismatches
      if (session.schemaVersion !== this.seatSchemaVersion) {
        if (session.stackCentsSnapshot > 0) {
          // Cash out the player's chips
          const externalRef = `restart_mismatch_cashout_${this.state.tableId}_${session.userId}_${session.id}`;
          try {
            await CashierService.processCashGameCashOut({
              userId: session.userId,
              tableId: this.state.tableId,
              amountCents: session.stackCentsSnapshot,
              externalRef,
              tableMeta: {
                name: this.state.tableName,
              },
            });
          } catch (err: unknown) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                userId: session.userId,
                externalRef,
                message: err instanceof Error ? err.message : String(err),
              },
              "SEAT_RESTORE_VERSION_MISMATCH_CASHOUT_FAILED",
            );
          }
        }
        // Mark the session as left due to version mismatch
        await TableSeatSessionService.markLeftBySessionId({ id: session.id });
        continue;
      }

      try {
        // Restored players always start disconnected on boot and sit out until they explicitly rejoin.
        await this.dealer.restorePlayerFromSession(
          session.userId,
          `player_${session.userId.slice(0, 6)}`,
          session.seat,
          session.stackCentsSnapshot,
          { connected: false, sittingOut: true, reconnectTimeoutMs: this.RECONNECT_TIMEOUT_MS },
        );
        this.updateMetadataCounts();
      } catch (err: unknown) {
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId: session.userId,
            message: err instanceof Error ? err.message : String(err),
          },
          "SEAT_RESTORE_SKIPPED",
        );
      }
    }
  }

  /**
   * Maps snapshot reasons from the dealer to snapshot log reasons.
   * Translates internal event types to standardized logging categories.
   * 
   * @param reason - The snapshot reason from the dealer
   * @param frameReason - Optional frame reason for more granular mapping
   * @returns The mapped snapshot log reason or null if not mappable
   */
  private mapSnapshotReason(reason: string, frameReason?: FrameReason): SnapshotLogReason | null {
    // Use frame reason for more granular mapping if available
    if (frameReason) {
      switch (frameReason) {
        case "HAND_START":
          return "HAND_START";
        case "ACTION_ACCEPTED":
          return "ACTION_ACCEPTED";
        case "RUNOUT_STAGE":
          return "STREET_TRANSITION";
        case "HAND_SHOWDOWN":
          return "SHOWDOWN";
        case "HAND_END":
          return "HAND_END";
      }
    }
    
    // Map dealer reasons to snapshot log reasons
    switch (reason) {
      case "HAND_START":
        return "HAND_START";
      case "ACTION_ACCEPTED":
      case "BOT_ACTION":
        return "ACTION_ACCEPTED";
      case "AUTO_TRANSITION":
      case "RUNOUT_STAGE":
        return "STREET_TRANSITION";
      case "SHOWDOWN":
      case "HAND_SHOWDOWN":
        return "SHOWDOWN";
      case "HAND_END":
        return "HAND_END";
      case "JOIN":
      case "RECONNECT":
      case "SEAT_CHANGE":
        return "PLAYER_JOIN";
      default:
        return null;
    }
  }
}
