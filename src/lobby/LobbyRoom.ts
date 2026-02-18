import { Room } from "@colyseus/core";
import { matchMaker } from "@colyseus/core";
import { CreateTableSchema, JoinTableSchema } from "./schemas.js";
import { buildTableConfig, isPasswordValid } from "./TableManager.js";
import type { LobbyTableSummary } from "./types.js";
import { LobbyInboundMessageSchema, LobbyOutboundMessageSchema } from "@poker-champ/realtime-contract";
import { logger } from "../lib/logger.js";
import { AuthService } from "../engine/auth/AuthService.js";

type LobbyState = any;

type LobbyAuth = { userId: string } | Record<string, never>;

export class LobbyRoom extends Room<LobbyState> {
  private readonly userIdBySessionId = new Map<string, string>();

  async onAuth(
    _client: { sessionId: string },
    options: { token?: string; authorization?: string },
  ): Promise<LobbyAuth> {
    const raw = options?.token ?? options?.authorization;
    const token = typeof raw === "string" && raw.length > 0 ? raw.replace(/^Bearer\s+/i, "").trim() : null;
    if (!token) return {};
    try {
      const user = await AuthService.validateSession(token);
      return user ? { userId: user.id } : {};
    } catch {
      return {};
    }
  }

  onJoin(_client: { sessionId: string }, _options: unknown, auth?: LobbyAuth): void {
    const userId = auth && "userId" in auth ? auth.userId : undefined;
    if (userId) this.userIdBySessionId.set(_client.sessionId, userId);
  }

  onLeave(client: { sessionId: string }): void {
    this.userIdBySessionId.delete(client.sessionId);
  }

  async pushTableListUpdate() {
    const tables = await this.queryTables();
    this.broadcastLobbyMessage("TABLE_LIST", { tables });
  }

  onCreate() {
    this.onMessage("LIST_TABLES", async (client, message) => {
      const inbound = LobbyInboundMessageSchema.safeParse({ type: "LIST_TABLES", payload: message });
      if (!inbound.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: inbound.error.flatten() });
        return;
      }

      const tables = await this.queryTables();
      this.sendLobbyMessage(client, "TABLE_LIST", { tables });
    });

    this.onMessage("CREATE_TABLE", async (client, message) => {
      const inbound = LobbyInboundMessageSchema.safeParse({ type: "CREATE_TABLE", payload: message });
      if (!inbound.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: inbound.error.flatten() });
        return;
      }

      const parsed = CreateTableSchema.safeParse(inbound.data.payload ?? {});
      if (!parsed.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      const creatorId = this.userIdBySessionId.get(client.sessionId);
      const cfg = await buildTableConfig({ ...parsed.data, creatorId });
      const created = await matchMaker.createRoom("poker", { tableConfig: cfg });
      const roomId =
        typeof created === "string"
          ? created
          : (created as { roomId?: string } | null | undefined)?.roomId;

      if (!roomId) {
        this.sendLobbyMessage(client, "ERROR", { code: "CREATE_FAILED", message: "Table room was created without a roomId." });
        return;
      }

      this.sendLobbyMessage(client, "TABLE_CREATED", { tableId: cfg.tableId, roomId });
      await this.pushTableListUpdate();
    });

    this.onMessage("JOIN_TABLE", async (client, message) => {
      const inbound = LobbyInboundMessageSchema.safeParse({ type: "JOIN_TABLE", payload: message });
      if (!inbound.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: inbound.error.flatten() });
        return;
      }

      const parsed = JoinTableSchema.safeParse(inbound.data.payload ?? {});
      if (!parsed.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      const tables = await this.queryTables(true);
      const target: any = tables.find(t => t.tableId === parsed.data.tableId);
      if (!target) {
        this.sendLobbyMessage(client, "ERROR", { code: "NOT_FOUND", message: "Table not found." });
        return;
      }

      if (target.visibility === "PRIVATE") {
        const pw = parsed.data.password ?? "";
        const passwordHash = target.passwordHash as string | undefined;
        if (!passwordHash || !pw || !(await isPasswordValid(pw, passwordHash))) {
          this.sendLobbyMessage(client, "ERROR", { code: "BAD_PASSWORD", message: "Invalid password." });
          return;
        }
      }

      this.sendLobbyMessage(client, "TABLE_JOIN_INFO", { tableId: target.tableId, roomId: target.roomId });
    });
  }

  private sendLobbyMessage(client: { send: (type: string, payload: unknown) => void }, type: string, payload: unknown) {
    const parsed = LobbyOutboundMessageSchema.safeParse({ type, payload });
    if (!parsed.success) {
      logger.warn({ room: "lobby", type, errors: parsed.error.flatten() }, "Dropping invalid lobby outbound message");
      return;
    }
    client.send(type, payload);
  }

  private broadcastLobbyMessage(type: string, payload: unknown) {
    const parsed = LobbyOutboundMessageSchema.safeParse({ type, payload });
    if (!parsed.success) {
      logger.warn({ room: "lobby", type, errors: parsed.error.flatten() }, "Dropping invalid lobby broadcast message");
      return;
    }
    this.broadcast(type, payload);
  }

  private async queryTables(includePrivateHash: boolean = false): Promise<(LobbyTableSummary & { passwordHash?: string })[]> {
    const rooms = await matchMaker.query({ name: "poker" });

    return rooms.map((r: { metadata?: Record<string, unknown>; roomId?: string; clients?: number; maxClients?: number }) => {
      const m = r.metadata ?? {};
      const summary: LobbyTableSummary & { passwordHash?: string } = {
        tableId: (m.tableId as string) ?? r.roomId ?? "",
        roomId: r.roomId ?? "",
        name: (m.name as string) ?? "Hold'em",
        players: r.clients ?? 0,
        maxSeats: (m.maxSeats as number) ?? r.maxClients ?? 9,
        smallBlindCents: (m.smallBlindCents as number) ?? 50,
        bigBlindCents: (m.bigBlindCents as number) ?? 100,
        minBuyInCents: (m.minBuyInCents as number) ?? 2000,
        maxBuyInCents: (m.maxBuyInCents as number) ?? 20000,
        visibility: (m.visibility as "PUBLIC" | "PRIVATE") ?? "PUBLIC",
        speed: (m.speed as "normal" | "fast") ?? "normal",
        runningSince: m.runningSince as number | undefined,
        createdAt: (m.createdAt as number) ?? Date.now(),
        creatorId: m.creatorId != null ? String(m.creatorId) : undefined,
        humanCount: typeof m.humanCount === "number" ? m.humanCount : undefined,
      };
      if (includePrivateHash) summary.passwordHash = m.passwordHash as string | undefined;
      return summary;
    }).sort((a, b) => (b.players - a.players) || (b.createdAt - a.createdAt));
  }
}
