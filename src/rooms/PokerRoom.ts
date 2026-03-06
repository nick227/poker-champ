/**
 * Import dependencies for the poker room implementation
 * - Room, Client, CloseCode: Core Colyseus room management
 * - PokerState: The game state management class
 * - Dealer: Core poker game engine that handles all game logic
 * - Various schemas: Type validation for incoming/outgoing messages
 * - Services: Authentication, persistence, economy, and other business logic
 * - Utilities: Logging, rate limiting, bot management, etc.
 */
import { Room, Client, CloseCode, matchMaker } from "@colyseus/core";
import { PokerState } from "../state/PokerState.js";
import { Dealer } from "../engine/Dealer.js";
import { ActionPayloadSchema } from "../messages/schemas.js";
import { logger } from "../lib/logger.js";
import { PokerError } from "../engine/errors.js";
import { PersistenceFacade } from "../engine/persistence/PersistenceFacade.js";
import { AuthService } from "../engine/auth/AuthService.js";
import { sessionEvents } from "../engine/auth/SessionEvents.js";
import {
  TableInboundMessageSchema,
  TableJoinOptionsSchema,
  type TableOutboundMessage,
  TableOutboundMessageSchema,
  AddBotPayloadSchema,
  RemoveBotPayloadSchema,
  ChatPayloadSchema,
} from "@poker-champ/realtime-contract";
import type { ZodIssue } from "zod";
import { nanoid } from "nanoid";
import { newBotId } from "../engine/bots/botIds.js";
import { isPersistentSeatsEnabled, isTableSnapshotLogPersistenceEnabled } from "../config/features.js";
import { getSeatHardDeleteHours, getSeatRetentionHours } from "../config/seats.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSnapshotLogService, type SnapshotLogReason } from "../engine/persistence/TableSnapshotLogService.js";
import type { FrameReason } from "../engine/replay/FrameReason.js";
import { registerVoiceRelay } from "./voice/register-voice-relay.js";
import { presenceIndex } from "../lobby/PresenceIndex.js";
import { createPerClientRateLimiter } from "./perClientRateLimit.js";
import { listEnabledBotSummaries, resolveBotSelectionForAdd } from "../engine/bots/BotCatalog.js";
import { getPrisma } from "../db/prisma.js";
import { awardService } from "../awards/index.js";

/**
 * Type definition for join options when a client connects to the table
 * - name: Optional display name for the player
 * - buyInCents: Optional initial buy-in amount in cents
 * - password: Optional password for private tables
 * - tableId: Optional table identifier for routing
 */
type JoinOptions = { name?: string; buyInCents?: number; password?: string; tableId?: string };

/** Close code when leaving due to joining another table; client treats as non-error and does not reconnect. */
/** Must differ from CloseCode.CONSENTED (4000) so onLeave can tell user leave from session-replaced. */
const LEAVE_CODE_SESSION_REPLACED = 4001;

/**
 * Authentication context returned after successful token validation
 * - userId: Unique identifier for the authenticated user
 * - sessionId: The JWT token that was validated
 * - roles: Array of user roles (e.g., 'player', 'admin')
 * - username: Display name for the user
 */
type AuthContext = { userId: string; sessionId: string; roles: string[]; username: string };

/**
 * Configuration for creating a new poker table
 * - tableId: Unique identifier for the table
 * - name: Display name for the table
 * - maxSeats: Maximum number of players allowed
 * - smallBlindCents/bigBlindCents: Blind amounts in cents
 * - minBuyInCents/maxBuyInCents: Buy-in limits
 * - visibility: Whether table is public or private
 * - showStats: Whether to display player statistics
 * - passwordHash: Hashed password for private tables
 * - speed: Game speed (normal or fast)
 * - createdAt: Timestamp when table was created
 * - creatorId: Optional ID of the table creator
 */
type TableConfig = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  showStats: boolean;
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  updatedAt: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
};

/**
 * Metadata exposed to the lobby system for table discovery
 * Includes all table configuration plus runtime state:
 * - runningSince: When the table became active
 * - humanCount: Total number of human players (including disconnected)
 * - connectedHumanCount: Number of currently connected human players
 */
type PokerRoomMetadata = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  showStats: boolean;
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  updatedAt: number;
  runningSince?: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  humanCount?: number;
  connectedHumanCount?: number;
  avgPotCents?: number;
  waitlistCount?: number;
};

/**
 * Configuration options for the sitting out cleanup sweep
 * - nowTs: Optional timestamp to use for "now" (testing)
 * - abandonedPurgeMs: How long to wait before purging abandoned players
 */
type SittingOutSweepOptions = {
  nowTs?: number;
  abandonedPurgeMs?: number;
};

type InstantGamePresetId = "SIX_BOT_RING" | "HEADS_UP_BOT";

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
export class PokerRoom extends Room<{ state: PokerState; metadata: PokerRoomMetadata }> {
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
  /**
   * Maps client session IDs to user IDs for authentication and routing.
   * This is the source of truth for which user is behind which connection.
   */
  private readonly userIdBySessionId: Map<string, string> = new Map();
  /**
   * Tracks binding epochs per user to prevent race conditions during
   * reconnection scenarios. Each time a user rebinds to a new client,
   * the epoch increments. This allows us to detect and ignore stale
   * operations from old connections.
   */
  private readonly bindingEpochByUserId: Map<string, number> = new Map();
  /**
   * Tracks binding epochs per client session. Used in conjunction with
   * bindingEpochByUserId to validate that operations are coming from
   * the currently active client for a given user.
   */
  private readonly bindingEpochBySessionId: Map<string, number> = new Map();
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
  onCreate(options: any) {
    // Keep explicit in onCreate as well for defensive clarity in runtime logs.
    this.autoDispose = false;

    // Initialize the game state with a fresh PokerState instance
    this.setState(new PokerState());

    // Extract table configuration from creation options
    const cfg: TableConfig | undefined = options?.tableConfig;

    // Configure table state from provided config or use defaults
    this.state.tableId = cfg?.tableId ?? (options?.tableId ?? "table_poc");
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
      // Callback when table state snapshot is emitted for logging
      onTableSnapshotEmitted: async (snapshot) => {
        if (!this.snapshotLogEnabled) return;
        const mappedReason = this.mapSnapshotReason(snapshot.reason, snapshot.frameReason);
        if (!mappedReason) return;
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

    // Update lobby metadata with current player counts and table info
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

    // Register voice chat relay for real-time communication
    registerVoiceRelay(this);

    // Set up message handler for adding bots to the table
    this.onMessage("ADD_BOT", async (client, message) => {
      const envelope = { type: "ADD_BOT" as const, payload: message };
      const parsed = AddBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      // Verify user is seated and authorized to add bots
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to add a bot." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      try {
        // Resolve the bot selection from the catalog
        const resolved = resolveBotSelectionForAdd(parsed.data.botId);
        if (!resolved.ok) {
          const message =
            resolved.reason === "NO_ENABLED_BOTS"
              ? "No enabled bots are available."
              : "Unknown or disabled botId.";
          this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message });
          return;
        }
        // Create a unique runtime bot ID and add the bot to the table
        const runtimeBotId = newBotId();
        const botName = resolved.bot.name ?? parsed.data.name ?? "Bot";
        const catalogBotId = resolved.bot.id;
        await this.dealer.addBot(runtimeBotId, botName, parsed.data.buyInCents, catalogBotId);
        this.updateMetadataCounts();
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        this.sendTableMessage(client, "ERROR", { code: e?.code ?? "ADD_BOT_FAILED", message: e?.message ?? String(err) });
      }
    });

    // Set up message handler for listing available bots
    this.onMessage("LIST_BOTS", (client, message) => {
      const envelope = { type: "LIST_BOTS" as const, payload: message ?? {} };
      const parsed = TableInboundMessageSchema.safeParse(envelope);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      // Send the list of enabled bot summaries to the client
      this.sendTableMessage(client, "BOTS_LIST", { bots: listEnabledBotSummaries() });
    });

    // Set up message handler for removing bots from the table
    this.onMessage("REMOVE_BOT", async (client, message) => {
      const parsed = RemoveBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      // Verify user is seated and authorized to remove bots
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to remove a bot." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      const bot = this.state.playersById.get(parsed.data.botId);
      const canRemoveBetweenHands = this.state.street === "WAITING";
      const canRemoveDuringHand =
        bot?.kind === "BOT" &&
        (bot.status === "ABANDONED" || bot.status === "OUT" || bot.sittingOutUntilNextHand || bot.stackCents === 0);
      if (!canRemoveBetweenHands && !canRemoveDuringHand) {
        this.sendTableMessage(client, "ERROR", {
          code: "REMOVE_BOT_NOT_ALLOWED",
          message: "Can only remove bots between hands, or during a hand if the bot is sitting out or has zero stack.",
        });
        return;
      }
      try {
        await this.dealer.removeBot(parsed.data.botId);
        this.updateMetadataCounts();
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        this.sendTableMessage(client, "ERROR", { code: e?.code ?? "REMOVE_BOT_FAILED", message: e?.message ?? String(err) });
      }
    });

    // Set up message handler for chat messages
    this.onMessage("CHAT", (client, message) => {
      // Apply rate limiting to prevent spam
      if (!this.chatRateLimit.check(client.sessionId)) {
        this.sendTableMessage(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many messages. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      this.touchActivity();
      const parsed = ChatPayloadSchema.safeParse(message);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid chat message." });
        return;
      }
      // Verify user is authorized to chat
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be in the room to chat." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      // Only seated human players can chat
      const player = this.getPlayerByUserId(userId);
      if (!player || player.kind === "BOT") {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to chat." });
        return;
      }
      // Create and broadcast the chat message to all clients
      const payload = {
        id: nanoid(),
        tableId: this.state.tableId,
        senderUserId: userId,
        senderName: player.name || `player_${userId.slice(0, 6)}`,
        text: parsed.data.text,
        createdAtTs: Date.now(),
      };
      this.clients.forEach((c) => this.sendTableMessage(c, "CHAT_MESSAGE", payload));
    });

    // Set up message handler for player actions (bet, fold, check, etc.)
    this.onMessage("ACTION", async (client, message) => {
      // Apply rate limiting to prevent action spam
      if (!this.actionRateLimit.check(client.sessionId)) {
        this.sendTableMessage(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many actions. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      // Validate the message structure
      const envelope = TableInboundMessageSchema.safeParse({ type: "ACTION", payload: message });
      if (!envelope.success) {
        // Check for missing actionId specifically for better error messaging
        const missingActionId = envelope.error.issues.some((issue) => issue.path.join(".") === "payload.actionId");
        if (missingActionId) {
          this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "actionId is required for idempotency." });
          return;
        }
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: envelope.error.flatten() });
        return;
      }

      // Normalize the action payload to handle different message formats
      // and extract the actionId for idempotency
      const rawMessage = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
      const normalized = this.normalizeActionPayload(rawMessage);
      if (!normalized) {
        // Check for missing actionId in various possible locations
        const topLevelActionId = rawMessage.actionId;
        const nestedActionId =
          rawMessage.payload &&
          typeof rawMessage.payload === "object" &&
          typeof (rawMessage.payload as Record<string, unknown>).actionId === "string"
            ? (rawMessage.payload as Record<string, unknown>).actionId
            : undefined;
        const hasActionId =
          (typeof topLevelActionId === "string" && topLevelActionId.length > 0) ||
          (typeof nestedActionId === "string" && nestedActionId.length > 0);
        if (!hasActionId) {
          this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "actionId is required for idempotency." });
          return;
        }
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid ACTION message format." });
        return;
      }

      // Validate the action payload against the schema
      const parsed = ActionPayloadSchema.safeParse(normalized.payload);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      const userId = this.userIdBySessionId.get(client.sessionId);
      try {
        // Verify the user is authenticated and seated
        if (!userId) throw new PokerError("BAD_STATE", "Session is not bound to a seated user.");
        if (!this.isActiveBoundClient(userId, client)) return;
        
        // Update activity timestamp and log the action attempt
        this.touchActivity();
        logger.info(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            action: parsed.data.action,
            amountCents: parsed.data.amountCents,
          },
          "POKER_ACTION_ATTEMPT",
        );
        
        // Execute the action through the dealer; pass client so actor receives post-action snapshot even if unbound during async emit
        await this.dealer.handleAction(userId, parsed.data, normalized.actionId, client);
        this.lastAcceptedActionByUserId.set(userId, {
          action: parsed.data.action,
          amountCents: parsed.data.amountCents,
          actionId: normalized.actionId,
          atTs: Date.now(),
        });
        
        // Log successful action execution
        logger.info(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            action: parsed.data.action,
            amountCents: parsed.data.amountCents,
          },
          "POKER_ACTION_ACCEPTED",
        );
      } catch (err: any) {
        const isBenignDuplicateRetry = (() => {
          if (!(err instanceof PokerError)) return false;
          if (err.code !== "NOT_YOUR_TURN" && err.code !== "HAND_NOT_STARTED") return false;
          const last = this.lastAcceptedActionByUserId.get(userId ?? "");
          if (!last) return false;
          if (last.actionId !== normalized.actionId) return false;
          if (last.action !== parsed.data.action) return false;
          if ((last.amountCents ?? undefined) !== (parsed.data.amountCents ?? undefined)) return false;
          return Date.now() - last.atTs <= 1200;
        })();
        if (isBenignDuplicateRetry) {
          logger.info(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              sessionId: client.sessionId,
              userId,
              action: parsed.data.action,
              amountCents: parsed.data.amountCents,
            },
            "POKER_ACTION_DUPLICATE_RETRY_IGNORED",
          );
          return;
        }
        // Log and handle action rejection with appropriate error messaging
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            sessionId: client.sessionId,
            code: err instanceof PokerError ? err.code : "ACTION_REJECTED",
            message: err?.message ?? String(err),
          },
          "POKER_ACTION_REJECTED",
        );
        if (err instanceof PokerError) {
          this.sendTableMessage(client, "ERROR", {
            code: err.code,
            message: err.message,
            ...(err.meta ?? {}),
          });
        } else {
          this.sendTableMessage(client, "ERROR", { code: "ACTION_REJECTED", message: err?.message ?? String(err) });
        }
      }
    });

    // Set up message handler for toggling sit-out status
    this.onMessage("SET_SITTING_OUT", async (client, message) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "SET_SITTING_OUT", payload: message });
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.type !== "SET_SITTING_OUT") {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid sit-out payload." });
        return;
      }
      // Verify user is authenticated and seated
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Session is not bound to a seated user." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      try {
        // Update the player's sit-out status through the dealer
        await this.dealer.setPlayerSittingOut(userId, parsed.data.payload.sittingOut);
        this.updateMetadataCounts();
      } catch (err: any) {
        // Handle errors with appropriate messaging
        if (err instanceof PokerError) {
          this.sendTableMessage(client, "ERROR", {
            code: err.code,
            message: err.message,
            ...(err.meta ?? {}),
          });
          return;
        }
        this.sendTableMessage(client, "ERROR", { code: "SIT_OUT_TOGGLE_FAILED", message: err?.message ?? String(err) });
      }
    });

    // Explicit rejoin command: deterministic "sit back in" intent for retry-safe UI.
    this.onMessage("REJOIN", async (client, message) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "REJOIN", payload: message });
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.type !== "REJOIN") {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid rejoin payload." });
        return;
      }
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", {
          code: "REJOIN_FAILED_NOT_SEATED",
          message: "Could not rejoin table. You are not seated.",
        });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      if (this.isDeleting) {
        this.sendTableMessage(client, "ERROR", {
          code: "REJOIN_FAILED_TABLE_GONE",
          message: "Table no longer exists",
        });
        return;
      }
      if (!this.dealer.hasPlayer(userId)) {
        this.sendTableMessage(client, "ERROR", {
          code: "REJOIN_FAILED_NOT_SEATED",
          message: "Could not rejoin table. You are not seated.",
        });
        return;
      }
      if (this.getPlayerStackCents(userId) <= 0) {
        this.sendTableMessage(client, "ERROR", {
          code: "REJOIN_FAILED_OUT_OF_CHIPS",
          message: "Could not rejoin table. You are out of chips.",
        });
        return;
      }
      try {
        await this.dealer.setPlayerSittingOut(userId, false);
        this.updateMetadataCounts();
      } catch (err: any) {
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            code: err instanceof PokerError ? err.code : "REJOIN_FAILED_TEMPORARY",
            message: err?.message ?? String(err),
          },
          "POKER_REJOIN_FAILED",
        );
        this.sendTableMessage(client, "ERROR", {
          code: "REJOIN_FAILED_TEMPORARY",
          message: "Could not rejoin table. Please retry.",
        });
      }
    });

    // Set up event listener for user bans to kick banned players from tables
    const onBan = async (payload: { userId: string }) => {
      await this.kickUserByAdmin(payload.userId, "BANNED");
    };
    sessionEvents.on("user.banned", onBan);
    // Store cleanup function to remove listener when room is disposed
    this.unbindSessionEvent = () => sessionEvents.off("user.banned", onBan);

    // Log room creation and initialize activity tracking
    logger.info({ roomId: this.roomId, tableId: this.state.tableId }, "PokerRoom created");
    this.touchActivity();
    // Bootstrap persistent seat recovery for server restarts
    void this.bootstrapPersistentSeatRecovery();
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
  async onAuth(_client: Client, options: any, context: { token?: string; headers?: Headers }) {
    // Extract token from multiple possible sources in order of preference
    const tokenFromHeader = context?.headers?.get("authorization") ?? options?.authorization;
    const tokenFromContext = context?.token;
    const tokenFromOptions = options?.token;
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
  async onJoin(client: Client, options: JoinOptions, auth?: AuthContext) {
    const userId = auth?.userId;
    const requestedBuyInCents =
      Number.isInteger(options?.buyInCents) && (options?.buyInCents as number) > 0
        ? (options!.buyInCents as number)
        : null;
    // Use per-user join lock to prevent race conditions
    const lockKey = `${this.state.tableId}:${userId ?? client.sessionId}`;
    await this.withJoinLock(lockKey, async () => {
      // Prevent joins during room deletion
      if (this.isDeleting) {
        this.sendTableMessage(client, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        client.leave();
        return;
      }
      this.touchActivity();
      await this.runPersistentSeatCleanup();
      
      // Log the join attempt for debugging and monitoring
      logger.info(
        {
          roomId: this.roomId,
          tableId: this.state.tableId,
          sessionId: client.sessionId,
          userId,
          hasBuyIn: Number.isInteger(options?.buyInCents),
          buyInCents: options?.buyInCents,
        },
        "POKER_JOIN_ATTEMPT",
      );
      
      // Require authentication for all joins
      if (!userId || !auth) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Authentication required." });
        client.leave();
        return;
      }

      // Remove user from any other table so only one table connection is valid (avoids double-join / black screen on quick switch).
      const otherTableIds = presenceIndex.getTableIdsForUser(userId).filter((id) => id !== this.state.tableId);
      if (otherTableIds.length > 0) {
        type PokerRoomRef = { roomId?: string; metadata?: { tableId?: string } };
        const pokerRooms = (await matchMaker.query({ name: "poker" })) as PokerRoomRef[];
        for (const otherTableId of otherTableIds) {
          const otherRoom = pokerRooms.find((r) => r.metadata?.tableId === otherTableId);
          if (otherRoom?.roomId) {
            try {
              await matchMaker.remoteRoomCall(otherRoom.roomId, "requestUserLeaveBecauseJoiningAnotherTable" as never, [userId], 5000);
            } catch (err) {
              logger.warn(
                { err, roomId: this.roomId, tableId: this.state.tableId, otherTableId, userId },
                "requestUserLeaveBecauseJoiningAnotherTable failed",
              );
            }
          }
        }
      }

      // RESTORE mode: User already has a seat at this table, just reconnect
      if (this.dealer.hasPlayer(userId)) {
        const currentPlayer = this.state.playersById.get(userId);
        const shouldApplyJoinBuyInOverride =
          requestedBuyInCents != null &&
          this.state.street === "WAITING" &&
          currentPlayer?.stackCents === 0 &&
          currentPlayer?.status === "OUT";
        if (shouldApplyJoinBuyInOverride) {
          try {
            await this.processJoinBuyInForZeroStackSeat(userId, requestedBuyInCents);
          } catch (err: any) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                userId,
                buyInCents: requestedBuyInCents,
                code: err instanceof PokerError ? err.code : "JOIN_BUYIN_FAILED",
                message: err?.message ?? String(err),
              },
              "POKER_JOIN_BUYIN_OVERRIDE_FAILED",
            );
            if (err instanceof PokerError) this.sendTableMessage(client, "ERROR", { code: err.code, message: err.message });
            else this.sendTableMessage(client, "ERROR", { code: "JOIN_BUYIN_FAILED", message: err?.message ?? String(err) });
            client.leave();
            return;
          }
        }

        this.rebindClientExclusive(userId, client);
        this.logRestoreBindOk(userId, client.sessionId);
        await this.markReconnectedSafe(userId);
        await this.clearSittingOutOnRestoreSafe(userId);
        this.addTablePresence(client, userId, auth.username);
        if (this.persistentSeatsEnabled) {
          const stackCents = this.getPlayerStackCents(userId);
          await TableSeatSessionService.touchConnected({
            tableId: this.state.tableId,
            userId,
            stackCentsSnapshot: stackCents,
            handIdSnapshot: this.state.handId || undefined,
          });
        }
        this.sendTableMessage(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
        await this.dealer.emitSnapshotToUser(userId, "RECONNECT");
        this.handleEmptyStateChange();
        return;
      }

      // REBOUND mode: Check for persistent session to restore after disconnect
      if (this.persistentSeatsEnabled) {
        const persisted = await TableSeatSessionService.findRejoinableSession({
          tableId: this.state.tableId,
          userId,
        });
        if (persisted) {
          const shouldTreatPersistedAsNewJoin =
            requestedBuyInCents != null &&
            this.state.street === "WAITING" &&
            persisted.stackCentsSnapshot === 0 &&
            persisted.state === "SEATED_SITTING_OUT";
          if (shouldTreatPersistedAsNewJoin) {
            await TableSeatSessionService.markLeft({
              tableId: this.state.tableId,
              userId,
              reason: "JOIN_WITH_BUYIN_OVERRIDE",
              stackCentsSnapshot: persisted.stackCentsSnapshot,
              handIdSnapshot: this.state.handId || undefined,
            });
          } else {
          try {
            // Restore the player from their persistent session
            await this.dealer.restorePlayerFromSession(userId, auth.username, persisted.seat, persisted.stackCentsSnapshot);
            this.updateMetadataCounts();
            this.rebindClientExclusive(userId, client);
            this.logRestoreBindOk(userId, client.sessionId);
            await this.markReconnectedSafe(userId);
            await this.clearSittingOutOnRestoreSafe(userId);
            this.addTablePresence(client, userId, auth.username);
            await TableSeatSessionService.touchConnected({
              tableId: this.state.tableId,
              userId,
              stackCentsSnapshot: this.getPlayerStackCents(userId),
              handIdSnapshot: this.state.handId || undefined,
            });
            this.sendTableMessage(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
            await this.dealer.emitSnapshotToUser(userId, "RECONNECT");
            logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_REBOUND_PERSISTED");
            this.handleEmptyStateChange();
            return;
          } catch (err: any) {
            // Handle restoration failure gracefully
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                userId,
                code: err instanceof PokerError ? err.code : "RESTORE_FAILED",
                message: err?.message ?? String(err),
              },
              "POKER_JOIN_REBOUND_PERSISTED_FAILED",
            );
            this.sendTableMessage(client, "ERROR", {
              code: err instanceof PokerError ? err.code : "RESTORE_FAILED",
              message: err?.message ?? "Failed to restore persisted seat.",
            });
            client.leave();
            return;
          }
          }
        }
      }

      // NEW mode: Validate join options for new player seating
      const parsedJoin = TableJoinOptionsSchema.safeParse(options ?? {});
      if (!parsedJoin.success) {
        const hasBuyInIssue = parsedJoin.error.issues.some((issue: ZodIssue) => issue.path[0] === "buyInCents");
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            errors: parsedJoin.error.flatten(),
          },
          "POKER_JOIN_REJECTED_BAD_OPTIONS",
        );
        this.sendTableMessage(client, "ERROR", {
          code: hasBuyInIssue ? "MISSING_BUY_IN_CENTS" : "BAD_JOIN_OPTIONS",
          message: hasBuyInIssue ? "buyInCents is required and must be a positive integer." : "Invalid join options.",
          details: parsedJoin.error.flatten(),
        });
        client.leave();
        return;
      }

      // Extract player details from authenticated context
      const name = auth.username;
      const buyInCents = parsedJoin.data.buyInCents;

      try {
        // Double-check user isn't already seated (race condition protection)
        if (this.dealer.hasPlayer(userId)) {
          throw new PokerError("BAD_STATE", "User already seated at this table.");
        }

        // Bind the client to the user and add them to the table
        this.rebindClientExclusive(userId, client);
        await this.dealer.addPlayer(userId, name, buyInCents);
        this.updateMetadataCounts();
        
        // Create persistent seat record if enabled
        if (this.persistentSeatsEnabled) {
          const seat = this.findPlayerSeat(userId);
          const stackCents = this.getPlayerStackCents(userId);
          if (seat !== null) {
            await TableSeatSessionService.upsertActiveSeat({
              tableId: this.state.tableId,
              userId,
              seat,
              stackCentsSnapshot: stackCents,
              buyInCents,
              handIdSnapshot: this.state.handId || undefined,
            });
          }
        }
        
        // Send welcome message and initial game state
        this.sendTableMessage(client, "WELCOME", {
          roomId: this.roomId,
          playerId: userId,
          tableId: this.state.tableId,
          joinMode: "NEW",
        });
        this.addTablePresence(client, userId, auth.username);
        await this.dealer.emitSnapshotToUser(userId, "JOIN");
        logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_SUCCESS");
        this.handleEmptyStateChange();
      } catch (err: any) {
        // Handle join failures with appropriate error messaging
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            code: err instanceof PokerError ? err.code : "JOIN_FAILED",
            message: err?.message ?? String(err),
          },
          "POKER_JOIN_FAILED",
        );
        if (err instanceof PokerError) this.sendTableMessage(client, "ERROR", { code: err.code, message: err.message });
        else this.sendTableMessage(client, "ERROR", { code: "JOIN_FAILED", message: err?.message ?? String(err) });
        client.leave();
      }
    });
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
  async onLeave(client: Client, code?: number) {
    this.touchActivity();
    this.handleEmptyStateChange();
    
    // Track binding epoch to detect stale session operations
    const leaveBindingEpoch = this.bindingEpochBySessionId.get(client.sessionId);
    this.bindingEpochBySessionId.delete(client.sessionId);
    const userId = this.userIdBySessionId.get(client.sessionId) ?? client.auth?.userId;
    this.userIdBySessionId.delete(client.sessionId);

    if (!userId) return;

    // Check if this is a stale session (user has reconnected with new client)
    const boundClient = this.getBoundClient(userId);
    if (boundClient && boundClient.sessionId !== client.sessionId) {
      logger.info(
        { roomId: this.roomId, tableId: this.state.tableId, userId, sessionId: client.sessionId, closeCode: code },
        "POKER_LEAVE_STALE_SESSION_IGNORED",
      );
      return;
    }

    // Validate binding epoch to prevent race conditions
    if (!this.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
      logger.info(
        {
          roomId: this.roomId,
          tableId: this.state.tableId,
          userId,
          sessionId: client.sessionId,
          leaveBindingEpoch,
          currentBindingEpoch: this.bindingEpochByUserId.get(userId),
          closeCode: code,
        },
        "POKER_LEAVE_STALE_EPOCH_IGNORED",
      );
      return;
    }

    // Clean up the user's session and presence
    this.dealer.unbindClient(userId);
    this.removeTablePresence(userId);
    this.updateMetadataCounts();

    // Handle intentional leaves (user clicked leave button). Check before SESSION_REPLACED
    // because Colyseus uses CloseCode.CONSENTED === 4000, same as our LEAVE_CODE_SESSION_REPLACED.
    const consented = code === CloseCode.CONSENTED;
    if (consented) {
      await this.dealer.handleConsentedLeave(userId);
      await this.maybeRemoveBotsIfNoHumans();
      this.updateMetadataCounts();
      if (this.persistentSeatsEnabled) {
        await TableSeatSessionService.markLeft({
          tableId: this.state.tableId,
          userId,
          stackCentsSnapshot: 0,
          handIdSnapshot: this.state.handId || undefined,
        });
      }
      return;
    }

    // Session replaced (e.g. user joined another table). Already removed by requestUserLeaveBecauseJoiningAnotherTable; do not allow reconnection.
    if (code === LEAVE_CODE_SESSION_REPLACED) {
      this.bindingEpochBySessionId.delete(client.sessionId);
      this.userIdBySessionId.delete(client.sessionId);
      return;
    }

    // Handle unintentional disconnects - set up reconnection window
    const deadlineTs = Date.now() + 60_000;
    await this.markDisconnectedSafe(userId, deadlineTs);
    if (!this.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
      logger.info(
        {
          roomId: this.roomId,
          tableId: this.state.tableId,
          userId,
          sessionId: client.sessionId,
          leaveBindingEpoch,
          currentBindingEpoch: this.bindingEpochByUserId.get(userId),
          closeCode: code,
        },
        "POKER_LEAVE_STALE_EPOCH_AFTER_DISCONNECT_IGNORED",
      );
      return;
    }
    this.updateMetadataCounts();
    
    // Mark as sitting out in persistent storage if enabled
    if (this.persistentSeatsEnabled) {
      const stackCents = this.getPlayerStackCents(userId);
      await TableSeatSessionService.markSittingOut({
        tableId: this.state.tableId,
        userId,
        stackCentsSnapshot: stackCents,
        handIdSnapshot: this.state.handId || undefined,
      });
      if (!this.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
        logger.info(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            sessionId: client.sessionId,
            leaveBindingEpoch,
            currentBindingEpoch: this.bindingEpochByUserId.get(userId),
            closeCode: code,
          },
          "POKER_LEAVE_STALE_EPOCH_AFTER_PERSIST_IGNORED",
        );
        return;
      }
    }

    // Attempt to allow reconnection within the window
    try {
      const reconnected = await this.allowReconnection(client, 60);
      if (!this.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
        logger.info(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            sessionId: client.sessionId,
            leaveBindingEpoch,
            currentBindingEpoch: this.bindingEpochByUserId.get(userId),
            closeCode: code,
          },
          "POKER_LEAVE_STALE_EPOCH_AFTER_ALLOW_RECONNECT_IGNORED",
        );
        try {
          reconnected.leave(LEAVE_CODE_SESSION_REPLACED);
        } catch {}
        return;
      }
      if (this.isDeleting) {
        this.sendTableMessage(reconnected, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        try {
          reconnected.leave();
        } catch {}
        return;
      }
      
      // Successful reconnection - restore session
      this.rebindClientExclusive(userId, reconnected);
      this.logRestoreBindOk(userId, reconnected.sessionId);
      await this.markReconnectedSafe(userId);
      await this.clearSittingOutOnRestoreSafe(userId);
      this.addTablePresence(reconnected, userId);
      if (this.persistentSeatsEnabled) {
        const stackCents = this.getPlayerStackCents(userId);
        await TableSeatSessionService.touchConnected({
          tableId: this.state.tableId,
          userId,
          stackCentsSnapshot: stackCents,
          handIdSnapshot: this.state.handId || undefined,
        });
      }
      this.sendTableMessage(reconnected, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
      await this.dealer.emitSnapshotToUser(userId, "RECONNECT");
      this.updateMetadataCounts();
    } catch {
      // Reconnection window expired - handle abandonment
      if (this.persistentSeatsEnabled) {
        this.updateMetadataCounts();
        logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_RECONNECT_WINDOW_EXPIRED_SEAT_PRESERVED");
        return;
      }
      await this.markAbandonedSafe(userId);
      await this.maybeRemoveBotsIfNoHumans();
      this.updateMetadataCounts();
    }
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
      } catch {}
      try {
        client.leave();
      } catch {}
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
      this.userIdBySessionId.delete(client.sessionId);
      this.bindingEpochBySessionId.delete(client.sessionId);
      this.bindingEpochByUserId.delete(userId);
      this.updateMetadataCounts();
      try {
        this.sendTableMessage(client, "ERROR", { code: "SESSION_REPLACED", message: "You joined another table." });
        client.leave(LEAVE_CODE_SESSION_REPLACED);
      } catch {}
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
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }> {
    const target =
      presetId === "SIX_BOT_RING"
        ? 5
        : presetId === "HEADS_UP_BOT"
          ? 1
          : 0;

    if (target <= 0) {
      return { ok: false, added: 0, target, reason: "UNSUPPORTED_PRESET" };
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
    this.isDeleting = true;
    
    // Clean up idle disposal timer
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
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
    for (const userId of this.userIdBySessionId.values()) {
      this.removeTablePresence(userId);
    }
    
    // Clear all tracking maps to prevent memory leaks
    this.userIdBySessionId.clear();
    this.bindingEpochBySessionId.clear();
    this.bindingEpochByUserId.clear();
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
    const outbound = parsed.data as any;
    client.send(outbound.type, outbound.payload);
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
    // Disconnect any existing client for this user
    const oldClient = this.getBoundClient(userId);
    if (oldClient && oldClient.sessionId !== client.sessionId) {
      try {
        this.sendTableMessage(oldClient, "ERROR", { code: "SESSION_REPLACED", message: "Session replaced by a newer connection." });
      } catch {}
      try {
        oldClient.leave(LEAVE_CODE_SESSION_REPLACED);
      } catch {}
    }
    
    // Bind the new client and update tracking maps
    this.dealer.bindClient(userId, client);
    this.userIdBySessionId.set(client.sessionId, userId);
    const nextEpoch = (this.bindingEpochByUserId.get(userId) ?? 0) + 1;
    this.bindingEpochByUserId.set(userId, nextEpoch);
    this.bindingEpochBySessionId.set(client.sessionId, nextEpoch);
    this.updateMetadataCounts();
  }

  private logRestoreBindOk(userId: string, sessionId: string): void {
    logger.info(
      {
        roomId: this.roomId,
        tableId: this.state.tableId,
        userId,
        sessionId,
        epoch: this.bindingEpochByUserId.get(userId),
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
    if (typeof leaveBindingEpoch !== "number") {
      // Fail closed once a binding epoch exists for this user.
      return !this.bindingEpochByUserId.has(userId);
    }
    return this.bindingEpochByUserId.get(userId) === leaveBindingEpoch;
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

  /**
   * Gets the currently bound client for a user ID.
   * Uses type checking to safely access the dealer's getClient method.
   * 
   * @param userId - The user ID to get the client for
   * @returns The bound client or undefined if not found
   */
  private getBoundClient(userId: string): Client | undefined {
    const dealerAny = this.dealer as unknown as { getClient?: (id: string) => Client | undefined };
    if (typeof dealerAny.getClient !== "function") return undefined;
    return dealerAny.getClient(userId);
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
    const boundClient = this.getBoundClient(userId);
    return !boundClient || boundClient.sessionId === client.sessionId;
  }

  /**
   * Normalizes action payload to handle different message formats.
   * Extracts actionId from various locations and normalizes the payload structure.
   * Ensures idempotency by requiring a valid actionId.
   * 
   * @param payload - The raw action payload to normalize
   * @returns Normalized payload with actionId or null if invalid
   */
  private normalizeActionPayload(payload: unknown): { payload: unknown; actionId: string } | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const candidate = payload as Record<string, unknown>;
    const payloadRecord = candidate.payload as Record<string, unknown> | undefined;
    const payloadActionId = payloadRecord?.actionId;
    const actionId: string | undefined =
      typeof candidate.actionId === "string"
        ? candidate.actionId
        : candidate.payload !== undefined && typeof payloadActionId === "string"
          ? payloadActionId
          : undefined;
    if (candidate.payload !== undefined) {
      if (typeof actionId !== "string" || actionId.length < 1) return null;
      return { payload: candidate.payload, actionId };
    }
    const { actionId: embedded, ...rest } = candidate;
    if (typeof embedded !== "string" || embedded.length < 1) return null;
    return { payload: rest, actionId: embedded };
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
        } catch (err: any) {
          logger.warn(
            {
              roomId: this.roomId,
              tableId: this.state.tableId,
              userId,
              message: err?.message ?? String(err),
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
      } catch (err: any) {
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId,
            externalRef,
            message: err?.message ?? String(err),
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
    if (this.computeHumanCount() !== 0) return;
    // Avoid lifecycle/remove races while a hand is still active.
    if (this.state.street !== "WAITING") return;
    
    // Find and remove all bots
    const botIds = [...this.state.playersById.values()].filter((p) => p.kind === "BOT").map((p) => p.id);
    for (const botId of botIds) {
      try {
        await this.dealer.removeBot(botId);
      } catch (err) {
        logger.warn({ roomId: this.roomId, tableId: this.state.tableId, botId }, "maybeRemoveBots removeBot failed");
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
        logger.warn({ roomId: this.roomId, sessionId: c.sessionId }, "requestDisconnect sendTableMessage failed");
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
          } catch (err: any) {
            logger.warn(
              {
                roomId: this.roomId,
                tableId: this.state.tableId,
                userId: session.userId,
                externalRef,
                message: err?.message ?? String(err),
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
          { connected: false, sittingOut: true },
        );
        this.updateMetadataCounts();
      } catch (err: any) {
        logger.warn(
          {
            roomId: this.roomId,
            tableId: this.state.tableId,
            userId: session.userId,
            message: err?.message ?? String(err),
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
