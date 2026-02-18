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
} from "@poker-champ/realtime-contract";
import { newBotId } from "../engine/bots/botIds.js";
import { isPersistentSeatsEnabled, isTableSnapshotLogPersistenceEnabled } from "../config/features.js";
import { getSeatHardDeleteHours, getSeatRetentionHours } from "../config/seats.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { TableSnapshotLogService, type SnapshotLogReason } from "../engine/persistence/TableSnapshotLogService.js";

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

    this.dealer = new Dealer(this.state, new PersistenceFacade(this.state.tableId), {
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
        const mappedReason = this.mapSnapshotReason(snapshot.reason);
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
    });

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
      try {
        const botId = newBotId();
        await this.dealer.addBot(botId, parsed.data.name, parsed.data.buyInCents);
        this.updateHumanCountMetadata();
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        this.sendTableMessage(client, "ERROR", { code: e?.code ?? "ADD_BOT_FAILED", message: e?.message ?? String(err) });
      }
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
      try {
        await this.dealer.removeBot(parsed.data.botId);
        this.updateHumanCountMetadata();
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        this.sendTableMessage(client, "ERROR", { code: e?.code ?? "REMOVE_BOT_FAILED", message: e?.message ?? String(err) });
      }
    });

    this.onMessage("ACTION", async (client, message) => {
      const envelope = TableInboundMessageSchema.safeParse({ type: "ACTION", payload: message });
      if (!envelope.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: envelope.error.flatten() });
        return;
      }

      const normalized = this.normalizeActionPayload(envelope.data.payload);
      if (!normalized) {
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
        if (normalized.actionId) {
          await this.dealer.handleAction(userId, parsed.data, normalized.actionId);
        } else {
          await this.dealer.handleAction(userId, parsed.data);
        }
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
          this.sendTableMessage(client, "ERROR", { code: err.code, message: err.message });
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
        this.dealer.bindClient(userId, client);
        this.userIdBySessionId.set(client.sessionId, userId);
        this.dealer.markReconnected(userId);
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
            this.updateHumanCountMetadata();
            this.dealer.bindClient(userId, client);
            this.userIdBySessionId.set(client.sessionId, userId);
            this.dealer.markReconnected(userId);
            await TableSeatSessionService.touchConnected({
              tableId: this.state.tableId,
              userId,
              stackCentsSnapshot: this.getPlayerStackCents(userId),
              handIdSnapshot: this.state.handId || undefined,
            });
            this.sendTableMessage(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
            this.dealer.emitSnapshotToUser(userId, "RECONNECT");
            logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_REBOUND_PERSISTED");
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

        this.dealer.bindClient(userId, client);
        this.userIdBySessionId.set(client.sessionId, userId);
        await this.dealer.addPlayer(userId, name, buyInCents);
        this.updateHumanCountMetadata();
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
        this.dealer.emitSnapshotToUser(userId, "JOIN");
        logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_JOIN_SUCCESS");
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
    const userId = this.userIdBySessionId.get(client.sessionId) ?? client.auth?.userId;
    this.userIdBySessionId.delete(client.sessionId);

    if (!userId) return;

    this.dealer.unbindClient(userId);

    const consented = code === CloseCode.CONSENTED;
    if (consented) {
      await this.dealer.handleConsentedLeave(userId);
      this.updateHumanCountMetadata();
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
    this.dealer.markDisconnected(userId, deadlineTs);
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
      this.userIdBySessionId.set(reconnected.sessionId, userId);
      this.dealer.bindClient(userId, reconnected);
      this.dealer.markReconnected(userId);
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
    } catch {
      if (this.persistentSeatsEnabled) {
        logger.info({ roomId: this.roomId, tableId: this.state.tableId, userId }, "POKER_RECONNECT_WINDOW_EXPIRED_SEAT_PRESERVED");
        return;
      }
      await this.dealer.markAbandoned(userId);
    }
  }

  async kickUserByAdmin(userId: string, reason: string = "BANNED") {
    const client = this.dealer.getClient(userId);
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

  onDispose() {
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
    this.unbindSessionEvent?.();
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

  private getPlayerStackCents(userId: string): number {
    for (const player of this.state.playersById.values()) {
      if (player.id === userId) return player.stackCents;
    }
    return 0;
  }

  private normalizeActionPayload(payload: unknown): { payload: unknown; actionId?: string } | null {
    if (!payload || typeof payload !== "object") {
      return { payload };
    }
    const candidate = payload as Record<string, unknown>;
    if (candidate.payload !== undefined) {
      return {
        payload: candidate.payload,
        actionId: typeof candidate.actionId === "string" ? candidate.actionId : undefined,
      };
    }
    return { payload };
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
          this.updateHumanCountMetadata();
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

  private getMetadataSafe(): Partial<PokerRoomMetadata> {
    try {
      return this.metadata ?? {};
    } catch {
      return {};
    }
  }

  private updateHumanCountMetadata(): void {
    const humanCount = this.computeHumanCount();
    const current = this.getMetadataSafe();
    if (current.humanCount !== humanCount) {
      void this.setMetadata({ ...current, humanCount });
    }
  }

  requestDisconnect(): void {
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
        this.updateHumanCountMetadata();
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

  private mapSnapshotReason(reason: string): SnapshotLogReason | null {
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
