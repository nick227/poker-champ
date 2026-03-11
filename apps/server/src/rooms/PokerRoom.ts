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
import { awardService } from "../awards/index.js";
import { PokerRoomController } from "./room/PokerRoomController.js";
import { dealerRuntimeMetrics } from "../engine/dealer/metrics/dealerRuntimeMetrics.js";
import type {
  PokerRoomFacade,
  JoinOptions,
  AuthContext,
  TableConfig,
  PokerRoomMetadata,
  SittingOutSweepOptions,
  InstantGamePresetId,
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
  /**
   * Per-key join locks to prevent race conditions when multiple clients
   * try to join simultaneously for the same user. Key format: "tableId:userId"
   */
  private readonly joinLocksByKey: Map<string, Promise<void>> = new Map();
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
  /**
   * Grace period in milliseconds before disposing an empty room.
   * Allows players to reconnect without losing their seats.
   * Default: 60 seconds (configurable via POKER_ROOM_EMPTY_GRACE_MS)
   */
  private readonly EMPTY_GRACE_MS = Number(process.env.POKER_ROOM_EMPTY_GRACE_MS ?? 60_000);
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

    // Limit maximum clients to the table's seat capacity
    this.maxClients = this.state.maxSeats;

    // Set initial room metadata for lobby discovery
    this.setMetadata({
      tableId: this.state.tableId,
      creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      creatorName: cfg?.creatorName ?? "Player",
      creatorAvatarUrl: cfg?.creatorAvatarUrl ?? null,
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
      // Callback when table state snapshot is emitted for logging and stall detection.
      // Invoked by SnapshotService.emitToAll and emitToUser only, so lastSnapshotAt stays accurate for TABLE_STALLED.
      onTableSnapshotEmitted: async (snapshot) => {
        this.lastSnapshotAt = Date.now();
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
    });

    this.controller = new PokerRoomController(this);
    this.controller.setupLifecycle({ cfg });
    this.controller.setupMessageHandlers();
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
      humanCount,
      connectedHumanCount,
    });
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
      this.dealer.logEngineDecisionPublic("STALL_MONITOR_TICK");

      const queueDepth = this.dealer.getQueueDepth();
      dealerRuntimeMetrics.observeQueueDepth(queueDepth);
      const now = Date.now();
      if (decisionStallDetectionEnabled) {
        const stallReason = this.dealer.getStallReasonPublic(now);
        if (stallReason) {
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
                queueDepth,
              },
              "TABLE_STALLED",
            );
            this.lastStallLogAtMs = now;
            dealerRuntimeMetrics.recordTableStalled();
          }
          if (this.state.street !== "WAITING" && queueDepth === 0) {
            if (this.lastStallRedriveLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
              logger.warn(
                {
                  roomId: this.roomId,
                  tableId: this.state.tableId,
                  handId: this.state.handId,
                  stallReason,
                },
                "TABLE_STALLED_RECOVERY_REDRIVE",
              );
              this.lastStallRedriveLogAtMs = now;
              dealerRuntimeMetrics.recordTableStallRecoveryRedrive();
            }
            this.dealer.maybeActForBotPublic();
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
          !!toActPlayer &&
          toActPlayer.kind === "HUMAN" &&
          toActPlayer.connected &&
          toActPlayer.status === "ACTIVE" &&
          toActPlayer.needsAction;

        if (
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
                queueDepth,
              },
              "TABLE_STALLED",
            );
            this.lastStallLogAtMs = now;
            dealerRuntimeMetrics.recordTableStalled();
          }
          if (this.state.street !== "WAITING" && queueDepth === 0) {
            if (this.lastStallRedriveLogAtMs + STALL_LOG_MIN_INTERVAL_MS < now) {
              logger.warn(
                { roomId: this.roomId, tableId: this.state.tableId, handId: this.state.handId, stallReason },
                "TABLE_STALLED_RECOVERY_REDRIVE",
              );
              this.lastStallRedriveLogAtMs = now;
              dealerRuntimeMetrics.recordTableStallRecoveryRedrive();
            }
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
            ...dealerRuntimeMetrics.snapshot(),
          },
          "DEALER_RUNTIME_METRICS",
        );
        this.lastRuntimeMetricsLogAtMs = now;
      }
    }, STALL_CHECK_MS);
  }

  touchActivityInternal(): void {
    this.touchActivity();
  }

  handleEmptyStateChangeInternal(): void {
    this.handleEmptyStateChange();
  }

  scheduleIdleDisposeInternal(): void {
    this.scheduleIdleDispose();
  }

  addTablePresenceInternal(client: Client, userId: string, displayName?: string): void {
    this.addTablePresence(client, userId, displayName);
  }

  removeTablePresenceInternal(userId: string): void {
    this.removeTablePresence(userId);
  }

  async bootstrapPersistentSeatRecoveryInternal(): Promise<void> {
    await this.bootstrapPersistentSeatRecovery();
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

  async runSittingOutSweepInternal(options?: SittingOutSweepOptions): Promise<{ purgedUserIds: string[] }> {
    return this.runSittingOutSweep(options);
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

  normalizeActionPayloadInternal(payload: unknown): { payload: unknown; actionId: string; handId?: string } | null {
    return this.normalizeActionPayload(payload);
  }

  getPlayerByUserIdInternal(userId: string): { id: string; kind: string; name: string } | null {
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

  processJoinBuyInForZeroStackSeatInternal(userId: string, buyInCents: number): Promise<void> {
    return this.processJoinBuyInForZeroStackSeat(userId, buyInCents);
  }

  logRestoreBindOkInternal(userId: string, sessionId: string): void {
    this.logRestoreBindOk(userId, sessionId);
  }

  markDisconnectedSafeInternal(userId: string, disconnectDeadlineTs: number): Promise<void> {
    return this.markDisconnectedSafe(userId, disconnectDeadlineTs);
  }

  markReconnectedSafeInternal(userId: string): Promise<void> {
    return this.markReconnectedSafe(userId);
  }

  clearSittingOutOnRestoreSafeInternal(userId: string): Promise<void> {
    return this.clearSittingOutOnRestoreSafe(userId);
  }

  markAbandonedSafeInternal(userId: string): Promise<void> {
    return this.markAbandonedSafe(userId);
  }

  emitSnapshotsToAllSafeInternal(reason: string): Promise<void> {
    return this.emitSnapshotsToAllSafe(reason);
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
  }

  /**
   * Called remotely when the user is joining another table. Removes the user from this room
   * (cash out, leave) and closes their connection with LEAVE_CODE_SESSION_REPLACED so they do not reconnect.
   */
  async requestUserLeaveBecauseJoiningAnotherTable(userId: string): Promise<void> {
    if (!this.dealer.hasPlayer(userId)) return;
    const client = this.getBoundClient(userId);
    await this.dealer.handleConsentedLeave(userId);
    this.dealer.unbindClient(userId);
    this.removeTablePresence(userId);
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
    }
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
    await this.applyRebuy(userId, buyInCents, externalRef);
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

    for (let i = 0; i < missing; i += 1) {
      const summary = summaries[i % summaries.length];
      const runtimeBotId = newBotId();
      const botName = summary.name ?? `Bot ${summary.id}`;
      try {
        await this.dealer.addBot(runtimeBotId, botName, buyInCents, summary.id);
        added += 1;
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
    }

    return { ok: added === missing, added, target };
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
    this.dealer.stopDisconnectSweep();
    this.dealer.resetSessionStats();
    this.unbindSessionEvent?.();
    
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
  private getPlayerByUserId(userId: string): { id: string; kind: string; name: string } | null {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return { id: player.id, kind: player.kind, name: player.name };
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
  private async markReconnectedSafe(userId: string): Promise<void> {
    const dealer = this.dealer as unknown as {
      markReconnectedSerialized?: (id: string) => Promise<void>;
      markReconnected: (id: string) => void;
    };
    if (typeof dealer.markReconnectedSerialized === "function") {
      await dealer.markReconnectedSerialized(userId);
      return;
    }
    dealer.markReconnected(userId);
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
  private async markAbandonedSafe(userId: string): Promise<void> {
    const dealer = this.dealer as unknown as {
      markAbandonedSerialized?: (id: string) => Promise<void>;
      markAbandoned: (id: string) => Promise<void>;
    };
    if (typeof dealer.markAbandonedSerialized === "function") {
      await dealer.markAbandonedSerialized(userId);
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
   * Purge long-abandoned seated humans when no humans are currently connected.
   * Presence gate uses binding-map truth (connectedHumanCount), never PlayerState.connected.
   * 
   * @param options - Configuration options for the sweep
   * @returns List of user IDs that were purged
   */
  async runSittingOutSweep(options?: SittingOutSweepOptions): Promise<{ purgedUserIds: string[] }> {
    if (this.isDeleting) return { purgedUserIds: [] };
    if (!this.persistentSeatsEnabled) return { purgedUserIds: [] };
    if (this.computeConnectedHumanCount() > 0) return { purgedUserIds: [] };

    const nowTs = options?.nowTs ?? Date.now();
    const abandonedPurgeMs = options?.abandonedPurgeMs ?? 30 * 60 * 1000;
    
    // Find abandoned human players
    const abandonedHumans = [...this.state.playersById.values()]
      .filter((p) => p.kind === "HUMAN" && p.status === "ABANDONED")
      .map((p) => p.id);
    if (abandonedHumans.length === 0) return { purgedUserIds: [] };

    // Get disconnect times for abandoned players
    const disconnectRows = await TableSeatSessionService.listSittingOutDisconnectTimesForUsers({
      tableId: this.state.tableId,
      userIds: abandonedHumans,
    });
    const disconnectAtByUserId = new Map<string, number>();
    for (const row of disconnectRows) {
      if (row.disconnectAt instanceof Date) {
        disconnectAtByUserId.set(row.userId, row.disconnectAt.getTime());
      }
    }

    // Purge players who have been abandoned long enough
    const purgedUserIds: string[] = [];
    for (const userId of abandonedHumans) {
      const player = this.state.playersById.get(userId);
      // Do not purge while a reconnect grace window is still active in-memory.
      // This protects restored disconnected seats whose persisted disconnectAt may be older.
      if (player && player.disconnectDeadlineTs > 0 && nowTs <= player.disconnectDeadlineTs) continue;

      const disconnectedAtTs = disconnectAtByUserId.get(userId);
      if (disconnectedAtTs == null) continue;
      if (nowTs - disconnectedAtTs <= abandonedPurgeMs) continue;

      await this.dealer.removePlayer(userId);
      await TableSeatSessionService.markLeft({
        tableId: this.state.tableId,
        userId,
        reason: "ABANDONED_TIMEOUT",
      });
      purgedUserIds.push(userId);
    }

    if (purgedUserIds.length > 0) {
      await this.maybeRemoveBotsIfNoHumans();
      this.updateMetadataCounts();
    }
    return { purgedUserIds };
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
   * 
   * @returns The number of connected human players
   */
  private computeConnectedHumanCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.kind !== "BOT" && this.getBoundClient(p.id)) n++;
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
    const current = this.getMetadataSafe();
    if (current.humanCount !== humanCount || current.connectedHumanCount !== connectedHumanCount) {
      void this.setMetadata({ ...current, humanCount, connectedHumanCount, updatedAt: Date.now() });
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
  }

  /**
   * Updates the last activity timestamp for the room.
   * Used for idle detection and automatic disposal.
   */
  private touchActivity(): void {
    this.lastActiveAtTs = Date.now();
  }

  /**
   * Gets the current number of connected clients.
   * 
   * @returns The number of connected clients
   */
  private getConnectedClientCount(): number {
    return this.clients?.length ?? 0;
  }

  /**
   * Handles changes in the empty state of the room.
   * Manages the idle disposal timer based on client connections.
   */
  private handleEmptyStateChange(): void {
    const count = this.getConnectedClientCount();
    if (count === 0) {
      // Room became empty - start grace period timer
      if (this.emptySinceTs == null) {
        this.emptySinceTs = Date.now();
        this.scheduleIdleDispose();
      }
      return;
    }
    // Room has clients - clear empty state and timer
    this.emptySinceTs = null;
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
    }
  }

  /**
   * Schedules the idle disposal timer for an empty room.
   * The timer will dispose the room if it remains empty beyond
   * the grace period and idle timeout.
   */
  private scheduleIdleDispose(): void {
    if (this.idleDisposeTimer) return;
    this.idleDisposeTimer = setTimeout(() => {
      const now = Date.now();
      if (this.getConnectedClientCount() !== 0) return;
      if (this.emptySinceTs != null && now - this.emptySinceTs < this.EMPTY_GRACE_MS) {
        // Still in grace period - reschedule
        this.idleDisposeTimer = null;
        this.scheduleIdleDispose();
        return;
      }
      logger.info(
        { roomId: this.roomId, tableId: this.state.tableId, idleMs: now - this.lastActiveAtTs },
        "POKER_ROOM_IDLE_DISPOSE",
      );
      this.requestDisconnect();
    }, this.IDLE_DISPOSE_MS);
  }

  /**
   * Requests the room to disconnect and dispose.
   * Validates that no humans are connected before proceeding.
   * Notifies all clients and initiates disconnection.
   */
  async requestDisconnect(): Promise<void> {
    this.isDeleting = true;
    const connectedHumanCount = this.computeConnectedHumanCount();
    if (connectedHumanCount !== 0) {
      throw new Error(`DELETE_INVARIANT_FAILED: connectedHumanCount=${connectedHumanCount}`);
    }
    
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

