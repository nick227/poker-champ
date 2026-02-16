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
  createdAt: number;
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
  createdAt: number;
  runningSince?: number;
};

export class PokerRoom extends Room<{ state: PokerState; metadata: PokerRoomMetadata }> {
  private dealer!: Dealer;
  private readonly userIdBySessionId: Map<string, string> = new Map();
  private unbindSessionEvent?: () => void;

  onCreate(options: any) {
    this.setState(new PokerState());

    const cfg: TableConfig | undefined = options?.tableConfig;

    this.state.tableId = cfg?.tableId ?? (options?.tableId ?? "table_poc");
    this.state.tableName = cfg?.name ?? "Hold'em";
    this.state.visibility = cfg?.visibility ?? "PUBLIC";
    this.state.maxSeats = cfg?.maxSeats ?? 9;
    this.state.createdAtTs = cfg?.createdAt ?? Date.now();

    this.state.smallBlindCents = cfg?.smallBlindCents ?? this.state.smallBlindCents;
    this.state.bigBlindCents = cfg?.bigBlindCents ?? this.state.bigBlindCents;
    this.state.minBuyInCents = cfg?.minBuyInCents ?? this.state.minBuyInCents;
    this.state.maxBuyInCents = cfg?.maxBuyInCents ?? this.state.maxBuyInCents;

    this.maxClients = this.state.maxSeats;

    this.dealer = new Dealer(this.state, new PersistenceFacade(this.state.tableId));

    // Lobby metadata
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
      createdAt: this.state.createdAtTs,
      runningSince: undefined,
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

      const parsed = ActionPayloadSchema.safeParse(envelope.data.payload);
      if (!parsed.success) {
        this.sendTableMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      try {
        const userId = this.userIdBySessionId.get(client.sessionId);
        if (!userId) throw new PokerError("BAD_STATE", "Session is not bound to a seated user.");
        await this.dealer.handleAction(userId, parsed.data);
      } catch (err: any) {
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
    if (this.metadata?.runningSince !== runningSince) {
      void this.setMetadata({ ...this.metadata, runningSince });
    }
  }

  async onJoin(client: Client, options: JoinOptions, auth?: AuthContext) {
    const userId = auth?.userId;
    if (!userId) {
      this.sendTableMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Authentication required." });
      client.leave();
      return;
    }

    // Server-authoritative rebind: if seat already exists for this user, restore session.
    if (this.dealer.hasPlayer(userId)) {
      this.dealer.bindClient(userId, client);
      this.userIdBySessionId.set(client.sessionId, userId);
      this.dealer.markReconnected(userId);
      this.sendTableMessage(client, "SESSION_RESTORED", { userId, deadlineTs: 0 });
      this.dealer.emitSnapshotToUser(userId, "RECONNECT");
      return;
    }

    const parsedJoin = TableJoinOptionsSchema.safeParse(options ?? {});
    if (!parsedJoin.success) {
      const hasBuyInIssue = parsedJoin.error.issues.some((issue) => issue.path[0] === "buyInCents");
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
      this.sendTableMessage(client, "WELCOME", { roomId: this.roomId, playerId: userId, tableId: this.state.tableId });
      this.dealer.emitSnapshotToUser(userId, "JOIN");
    } catch (err: any) {
      if (err instanceof PokerError) this.sendTableMessage(client, "ERROR", { code: err.code, message: err.message });
      else this.sendTableMessage(client, "ERROR", { code: "JOIN_FAILED", message: err?.message ?? String(err) });
      client.leave();
    }
  }

  async onLeave(client: Client, code?: number) {
    const userId = this.userIdBySessionId.get(client.sessionId) ?? client.auth?.userId;
    this.userIdBySessionId.delete(client.sessionId);

    if (!userId) return;

    this.dealer.unbindClient(userId);

    const consented = code === CloseCode.CONSENTED;
    if (consented) {
      await this.dealer.removePlayer(userId);
      return;
    }

    const deadlineTs = Date.now() + 60_000;
    this.dealer.markDisconnected(userId, deadlineTs);

    try {
      const reconnected = await this.allowReconnection(client, 60);
      this.userIdBySessionId.set(reconnected.sessionId, userId);
      this.dealer.bindClient(userId, reconnected);
      this.dealer.markReconnected(userId);
      this.sendTableMessage(reconnected, "SESSION_RESTORED", { userId, deadlineTs: 0 });
      this.dealer.emitSnapshotToUser(userId, "RECONNECT");
    } catch {
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
}
