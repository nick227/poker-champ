import { Room, Client, CloseCode } from "@colyseus/core";
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
  TableOutboundMessageSchema,
  AddBotPayloadSchema,
  RemoveBotPayloadSchema,
  ChatPayloadSchema,
} from "@poker-champ/realtime-contract";
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

type JoinOptions = { name?: string; buyInCents?: number; password?: string; tableId?: string };
type AuthContext = { userId: string; sessionId: string; roles: string[]; username: string };

type TableConfig = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  creatorId?: string;
};

type PokerRoomMetadata = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  runningSince?: number;
  creatorId?: string;
  humanCount?: number;
  connectedHumanCount?: number;
};

export class PokerRoom extends Room<{ state: PokerState; metadata: PokerRoomMetadata }> {
  // Keep cash-game rooms discoverable/joinable even when temporarily empty.
  override autoDispose = false;

  private dealer!: Dealer;
  private readonly userIdBySessionId: Map<string, string> = new Map();
  private unbindSessionEvent?: () => void;
  private readonly persistentSeatsEnabled = isPersistentSeatsEnabled();
  private readonly snapshotLogEnabled = isTableSnapshotLogPersistenceEnabled();
  private readonly joinLocksByKey: Map<string, Promise<void>> = new Map();
  private readonly seatSchemaVersion = 1;
  private readonly actionRateLimit = createPerClientRateLimiter({ maxPerWindow: 30, windowMs: 60_000 });
  private readonly chatRateLimit = createPerClientRateLimiter({ maxPerWindow: 20, windowMs: 60_000 });

  private lastActiveAtTs = Date.now();
  private emptySinceTs: number | null = null;
  private idleDisposeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly EMPTY_GRACE_MS = Number(process.env.POKER_ROOM_EMPTY_GRACE_MS ?? 60_000);
  private readonly IDLE_DISPOSE_MS = Number(process.env.POKER_ROOM_IDLE_DISPOSE_MS ?? 30 * 60_000);

  onCreate(options: any) {
    // Keep explicit in onCreate as well for defensive clarity in runtime logs.
    this.autoDispose = false;

    this.setState(new PokerState());

    const cfg: TableConfig | undefined = options?.tableConfig;

    this.state.tableId = cfg?.tableId ?? (options?.tableId ?? "table_poc");
    this.state.tableName = cfg?.name ?? "Hold'em";
    this.state.visibility = cfg?.visibility ?? "PUBLIC";
    this.state.speed = cfg?.speed ?? "normal";
    this.state.maxSeats = cfg?.maxSeats ?? 9;
    this.state.createdAtTs = cfg?.createdAt ?? Date.now();

    this.state.smallBlindCents = cfg?.smallBlindCents ?? this.state.smallBlindCents;
    this.state.bigBlindCents = cfg?.bigBlindCents ?? this.state.bigBlindCents;
    this.state.minBuyInCents = cfg?.minBuyInCents ?? this.state.minBuyInCents;
    this.state.maxBuyInCents = cfg?.maxBuyInCents ?? this.state.maxBuyInCents;

    this.maxClients = this.state.maxSeats;

    this.setMetadata({
      tableId: this.state.tableId,
      creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
    });

    this.dealer = new Dealer(
      this.state,
      new PersistenceFacade({
        tableId: this.state.tableId,
        tableName: this.state.tableName,
        creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      }),
      {
      onAutoSitOutReachedCap: async ({ userId, stackCents }) => {
        if (!this.persistentSeatsEnabled) return;
        await TableSeatSessionService.markSittingOut({
          tableId: this.state.tableId,
          userId,
          stackCentsSnapshot: stackCents,
          handIdSnapshot: this.state.handId || undefined,
        });
      },
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
    });

    // Lobby metadata
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
      passwordHash: cfg?.passwordHash,
      speed: cfg?.speed ?? "normal",
      createdAt: this.state.createdAtTs,
      runningSince: undefined,
      creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined,
      humanCount,
      connectedHumanCount,
    });

    registerVoiceRelay(this);

    this.onMessage("ADD_BOT", async (client, message) => {
      const envelope = { type: "ADD_BOT" as const, payload: message };
      const parsed = AddBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to add a bot." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      try {
        const resolved = resolveBotSelectionForAdd(parsed.data.botId);
        if (!resolved.ok) {
          const message =
            resolved.reason === "NO_ENABLED_BOTS"
              ? "No enabled bots are available."
              : "Unknown or disabled botId.";
          this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message });
          return;
        }
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

    this.onMessage("LIST_BOTS", (client, message) => {
      const envelope = { type: "LIST_BOTS" as const, payload: message ?? {} };
      const parsed = TableInboundMessageSchema.safeParse(envelope);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      this.sendTableMessage(client, "BOTS_LIST", { bots: listEnabledBotSummaries() });
    });

    this.onMessage("REMOVE_BOT", async (client, message) => {
      const parsed = RemoveBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to remove a bot." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      if (this.state.street !== "WAITING") {
        this.sendTableMessage(client, "ERROR", {
          code: "REMOVE_BOT_NOT_ALLOWED",
          message: "Can only remove bots between hands or when table is stopped.",
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

    this.onMessage("CHAT", (client, message) => {
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
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be in the room to chat." });
        return;
      }
      if (!this.isActiveBoundClient(userId, client)) return;
      const player = this.getPlayerByUserId(userId);
      if (!player || player.kind === "BOT") {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to chat." });
        return;
      }
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

    this.onMessage("ACTION", async (client, message) => {
      if (!this.actionRateLimit.check(client.sessionId)) {
        this.sendTableMessage(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many actions. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      const envelope = TableInboundMessageSchema.safeParse({ type: "ACTION", payload: message });
      if (!envelope.success) {
        const missingActionId = envelope.error.issues.some((issue) => issue.path.join(".") === "payload.actionId");
        if (missingActionId) {
          this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", message: "actionId is required for idempotency." });
          return;
        }
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: envelope.error.flatten() });
        return;
      }

      const rawMessage = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
      const normalized = this.normalizeActionPayload(rawMessage);
      if (!normalized) {
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

      const parsed = ActionPayloadSchema.safeParse(normalized.payload);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      try {
        const userId = this.userIdBySessionId.get(client.sessionId);
        if (!userId) throw new PokerError("BAD_STATE", "Session is not bound to a seated user.");
        if (!this.isActiveBoundClient(userId, client)) return;
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
        await this.dealer.handleAction(userId, parsed.data, normalized.actionId);
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

    const onBan = async (payload: { userId: string }) => {
      await this.kickUserByAdmin(payload.userId, "BANNED");
    };
    sessionEvents.on("user.banned", onBan);
    this.unbindSessionEvent = () => sessionEvents.off("user.banned", onBan);

    logger.info({ roomId: this.roomId, tableId: this.state.tableId }, "PokerRoom created");
    this.touchActivity();
    void this.bootstrapPersistentSeatRecovery();
  }

  async onAuth(_client: Client, options: any, context: { token?: string; headers?: Headers }) {
    const tokenFromHeader = context?.headers?.get("authorization") ?? options?.authorization;
    const tokenFromContext = context?.token;
    const tokenFromOptions = options?.token;
    const raw = tokenFromHeader ?? tokenFromContext ?? tokenFromOptions;
    const token = this.extractBearerToken(raw);

    if (!token) throw new Error("Missing Authorization bearer token.");

    const user = await AuthService.validateSession(token);
    if (!user) throw new Error("Invalid or expired session.");

    return {
      userId: user.id,
      sessionId: token,
      roles: [user.role],
      username: user.username ?? user.displayName ?? `player_${user.id.slice(0, 6)}`,
    } as AuthContext;
  }

  onBeforePatch(state: PokerState) {
    if (state.street !== "WAITING" && state.runningSinceTs === 0) {
      state.runningSinceTs = Date.now();
    }

    const runningSince = state.runningSinceTs || undefined;
    const current = this.getMetadataSafe();
    if (current.runningSince !== runningSince) {
      void this.setMetadata({ ...current, runningSince });
    }
  }

  async onJoin(client: Client, options: JoinOptions, auth?: AuthContext) {
    const userId = auth?.userId;
    const lockKey = `${this.state.tableId}:${userId ?? client.sessionId}`;
    await this.withJoinLock(lockKey, async () => {
      this.touchActivity();
      await this.runPersistentSeatCleanup();
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
      if (!userId || !auth) {
        this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Authentication required." });
        client.leave();
        return;
      }

      // Server-authoritative rebind: if seat already exists for this user, restore session.
      if (this.dealer.hasPlayer(userId)) {
        this.rebindClientExclusive(userId, client);
        await this.markReconnectedSafe(userId);
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
        this.dealer.emitSnapshotToUser(userId, "RECONNECT");
        this.handleEmptyStateChange();
        return;
      }

      if (this.persistentSeatsEnabled) {
        const persisted = await TableSeatSessionService.findRejoinableSession({
          tableId: this.state.tableId,
          userId,
        });
        if (persisted) {
          try {
            await this.dealer.restorePlayerFromSession(userId, auth.username, persisted.seat, persisted.stackCentsSnapshot);
            this.updateMetadataCounts();
            this.rebindClientExclusive(userId, client);
            await this.markReconnectedSafe(userId);
            this.addTablePresence(client, userId, auth.username);
            await TableSeatSessionService.touchConnected({
              tableId: this.state.tableId,
              userId,
              stackCentsSnapshot: this.getPlayerStackCents(userId),
              handIdSnapshot: this.state.handId || undefined,
            });
            this.sendTableMessage(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
            this.dealer.emitSnapshotToUser(userId, "RECONNECT");
            logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_REBOUND_PERSISTED");
            this.handleEmptyStateChange();
            return;
          } catch (err: any) {
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

      const parsedJoin = TableJoinOptionsSchema.safeParse(options ?? {});
      if (!parsedJoin.success) {
        const hasBuyInIssue = parsedJoin.error.issues.some((issue) => issue.path[0] === "buyInCents");
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

      // Authenticated users always use server-owned public handle.
      const name = auth.username;
      const buyInCents = parsedJoin.data.buyInCents;

      try {
        if (this.dealer.hasPlayer(userId)) {
          throw new PokerError("BAD_STATE", "User already seated at this table.");
        }

        this.rebindClientExclusive(userId, client);
        await this.dealer.addPlayer(userId, name, buyInCents);
        this.updateMetadataCounts();
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
        this.sendTableMessage(client, "WELCOME", {
          roomId: this.roomId,
          playerId: userId,
          tableId: this.state.tableId,
          joinMode: "NEW",
        });
        this.addTablePresence(client, userId, auth.username);
        this.dealer.emitSnapshotToUser(userId, "JOIN");
        logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_SUCCESS");
        this.handleEmptyStateChange();
      } catch (err: any) {
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

  async onLeave(client: Client, code?: number) {
    this.touchActivity();
    this.handleEmptyStateChange();
    const userId = this.userIdBySessionId.get(client.sessionId) ?? client.auth?.userId;
    this.userIdBySessionId.delete(client.sessionId);

    if (!userId) return;

    const boundClient = this.getBoundClient(userId);
    if (boundClient && boundClient.sessionId !== client.sessionId) {
      // Stale session: another client is bound to this userId. Do not unbind; ignore.
      logger.info(
        { roomId: this.roomId, tableId: this.state.tableId, userId, sessionId: client.sessionId },
        "POKER_LEAVE_STALE_SESSION_IGNORED",
      );
      // Decrement only this leaving session's table presence reference.
      this.removeTablePresence(userId);
      return;
    }

    this.dealer.unbindClient(userId);
    this.removeTablePresence(userId);

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

    const deadlineTs = Date.now() + 60_000;
    await this.markDisconnectedSafe(userId, deadlineTs);
    this.updateMetadataCounts();
    if (this.persistentSeatsEnabled) {
      const stackCents = this.getPlayerStackCents(userId);
      await TableSeatSessionService.markSittingOut({
        tableId: this.state.tableId,
        userId,
        stackCentsSnapshot: stackCents,
        handIdSnapshot: this.state.handId || undefined,
      });
    }

    try {
      const reconnected = await this.allowReconnection(client, 60);
      this.rebindClientExclusive(userId, reconnected);
      await this.markReconnectedSafe(userId);
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
      this.dealer.emitSnapshotToUser(userId, "RECONNECT");
      this.updateMetadataCounts();
    } catch {
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

  /** Called after economy buy-in (e.g. from EconomyRouter) to add chips to seated player. */
  async applyRebuy(userId: string, amountCents: number): Promise<void> {
    await this.dealer.applyRebuy(userId, amountCents);
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

  onDispose() {
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
    }
    logger.warn(
      {
        roomId: this.roomId,
        tableId: this.state?.tableId,
        autoDispose: this.autoDispose,
        clientCount: this.clients?.length ?? 0,
      },
      "POKER_ROOM_DISPOSED",
    );
    this.dealer.stopDisconnectSweep();
    this.dealer.resetSessionStats();
    this.unbindSessionEvent?.();
    for (const userId of this.userIdBySessionId.values()) {
      this.removeTablePresence(userId);
    }
    this.userIdBySessionId.clear();
  }

  private extractBearerToken(raw: unknown): string | null {
    if (typeof raw !== "string" || raw.length === 0) return null;
    if (raw.startsWith("Bearer ")) return raw.slice(7).trim();
    return raw.trim();
  }

  private sendTableMessage(client: { send: (type: string, payload: unknown) => void }, type: string, payload: unknown) {
    const parsed = TableOutboundMessageSchema.safeParse({ type, payload });
    if (!parsed.success) {
      logger.warn({ room: "poker", roomId: this.roomId, type, errors: parsed.error.flatten() }, "Dropping invalid poker outbound message");
      return;
    }
    client.send(parsed.data.type, parsed.data.payload);
  }

  private findPlayerSeat(userId: string): number | null {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return player.seat;
    }
    return null;
  }

  private getPlayerByUserId(userId: string): { id: string; kind: string; name: string } | null {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return { id: player.id, kind: player.kind, name: player.name };
    }
    return null;
  }

  private getPlayerStackCents(userId: string): number {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return player.stackCents;
    }
    return 0;
  }

  private rebindClientExclusive(userId: string, client: Client): void {
    const oldClient = this.getBoundClient(userId);
    if (oldClient && oldClient.sessionId !== client.sessionId) {
      try {
        this.sendTableMessage(oldClient, "ERROR", { code: "SESSION_REPLACED", message: "Session replaced by a newer connection." });
      } catch {}
      try {
        oldClient.leave(4000);
      } catch {}
    }
    this.dealer.bindClient(userId, client);
    this.userIdBySessionId.set(client.sessionId, userId);
  }

  private addTablePresence(client: Client, userId: string, displayName?: string): void {
    const authedUserId = client.auth?.userId;
    if (!authedUserId || authedUserId !== userId) return;
    presenceIndex.add(
      userId,
      { kind: "TABLE", tableId: this.state.tableId, tableName: this.state.tableName },
      displayName,
    );
  }

  private removeTablePresence(userId: string): void {
    if (!userId) return;
    presenceIndex.remove(userId, { kind: "TABLE", tableId: this.state.tableId, tableName: this.state.tableName });
  }

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

  private getBoundClient(userId: string): Client | undefined {
    const dealerAny = this.dealer as unknown as { getClient?: (id: string) => Client | undefined };
    if (typeof dealerAny.getClient !== "function") return undefined;
    return dealerAny.getClient(userId);
  }

  private isActiveBoundClient(userId: string, client: Client): boolean {
    const boundClient = this.getBoundClient(userId);
    return !boundClient || boundClient.sessionId === client.sessionId;
  }

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

  private async runPersistentSeatCleanup(): Promise<void> {
    if (!this.persistentSeatsEnabled) return;
    const retentionHours = getSeatRetentionHours();
    const hardDeleteHours = getSeatHardDeleteHours();
    const reap = await TableSeatSessionService.reapExpiredSessionsForTable({
      tableId: this.state.tableId,
      retentionHours,
      hardDeleteHours,
    });
    if (reap.softExpired.length === 0 && reap.hardDeletedCount === 0) return;

    for (const session of reap.softExpired) {
      const userId = session.userId;
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

  private isPlayerConnected(userId: string): boolean {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return Boolean(player.connected);
    }
    return false;
  }

  private computeHumanCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.kind !== "BOT") n++;
    }
    return n;
  }

  /** Count humans who have a bound client (binding map is source of truth, not PlayerState.connected). */
  private computeConnectedHumanCount(): number {
    let n = 0;
    for (const p of this.state.playersById.values()) {
      if (p.kind !== "BOT" && this.getBoundClient(p.id)) n++;
    }
    return n;
  }

  private getMetadataSafe(): Partial<PokerRoomMetadata> {
    try {
      return this.metadata ?? {};
    } catch {
      return {};
    }
  }

  private updateMetadataCounts(): void {
    const humanCount = this.computeHumanCount();
    const connectedHumanCount = this.computeConnectedHumanCount();
    const current = this.getMetadataSafe();
    if (current.humanCount !== humanCount || current.connectedHumanCount !== connectedHumanCount) {
      void this.setMetadata({ ...current, humanCount, connectedHumanCount });
    }
  }

  /** Remove all bots when zero seated humans remain (humanCount === 0, not connectedHumanCount). */
  private async maybeRemoveBotsIfNoHumans(): Promise<void> {
    if (this.computeHumanCount() !== 0) return;
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

  private touchActivity(): void {
    this.lastActiveAtTs = Date.now();
  }

  private getConnectedClientCount(): number {
    return this.clients?.length ?? 0;
  }

  private handleEmptyStateChange(): void {
    const count = this.getConnectedClientCount();
    if (count === 0) {
      if (this.emptySinceTs == null) {
        this.emptySinceTs = Date.now();
        this.scheduleIdleDispose();
      }
      return;
    }
    this.emptySinceTs = null;
    if (this.idleDisposeTimer) {
      clearTimeout(this.idleDisposeTimer);
      this.idleDisposeTimer = null;
    }
  }

  private scheduleIdleDispose(): void {
    if (this.idleDisposeTimer) return;
    this.idleDisposeTimer = setTimeout(() => {
      const now = Date.now();
      if (this.getConnectedClientCount() !== 0) return;
      if (this.emptySinceTs != null && now - this.emptySinceTs < this.EMPTY_GRACE_MS) {
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

  requestDisconnect(): void {
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

  private async bootstrapPersistentSeatRecovery(): Promise<void> {
    if (!this.persistentSeatsEnabled) return;
    const retentionHours = getSeatRetentionHours();
    const sessions = await TableSeatSessionService.listRestorableSessionsForTable({
      tableId: this.state.tableId,
      retentionHours,
    });
    if (sessions.length === 0) return;

    for (const session of sessions) {
      if (session.schemaVersion !== this.seatSchemaVersion) {
        if (session.stackCentsSnapshot > 0) {
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

  private mapSnapshotReason(reason: string, frameReason?: FrameReason): SnapshotLogReason | null {
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
