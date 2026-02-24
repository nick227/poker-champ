import { Room } from "@colyseus/core";
import { matchMaker } from "@colyseus/core";
import { z } from "zod";
import { CreateTableSchema, JoinTableSchema } from "./schemas.js";
import { buildTableConfig, isPasswordValid } from "./TableManager.js";
import type { LobbyTableSummary } from "./types.js";
import { LobbyInboundMessageSchema, LobbyOutboundMessageSchema } from "@poker-champ/realtime-contract";
import { logger } from "../lib/logger.js";
import { AuthService } from "../engine/auth/AuthService.js";
import { presenceIndex } from "./PresenceIndex.js";
import { getPrisma } from "../db/prisma.js";
import { nanoid } from "nanoid";

type LobbyState = any;

type LobbyAuth = { userId: string; displayName: string } | Record<string, never>;

const LOBBY_VOICE_CHANNEL_ID = "lobby";
const LOBBY_VOICE_CAP = 8;
const LOBBY_CHAT_SEND_SCHEMA = z.object({
  text: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(500)),
});

export class LobbyRoom extends Room<LobbyState> {
  private readonly userIdBySessionId = new Map<string, string>();
  private readonly sessionIdByUserId = new Map<string, string>();
  private readonly displayNameByUserId = new Map<string, string>();
  private readonly lobbyVoiceParticipants = new Set<string>();
  private unsubscribePresence?: () => void;
  private onlineCountBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lobbyChatLastSendAtByUserId = new Map<string, number>();
  private readonly lobbyChatBurstByUserId = new Map<string, number[]>();

  async onAuth(
    _client: { sessionId: string },
    options: { token?: string; authorization?: string },
  ): Promise<LobbyAuth> {
    const raw = options?.token ?? options?.authorization;
    const token = typeof raw === "string" && raw.length > 0 ? raw.replace(/^Bearer\s+/i, "").trim() : null;
    if (!token) return {};
    try {
      const user = await AuthService.validateSession(token);
      if (!user) return {};
      const displayName = user.displayName ?? user.username ?? `Player-${user.id.slice(0, 4)}`;
      return { userId: user.id, displayName };
    } catch {
      return {};
    }
  }

  onJoin(client: { sessionId: string; send: (type: string, payload: unknown) => void }, _options: unknown, auth?: LobbyAuth): void {
    const userId = auth && "userId" in auth ? auth.userId : undefined;
    if (!userId) return;
    const displayName = auth && "displayName" in auth ? auth.displayName : undefined;
    this.userIdBySessionId.set(client.sessionId, userId);
    this.sessionIdByUserId.set(userId, client.sessionId);
    if (typeof displayName === "string" && displayName.length > 0) {
      this.displayNameByUserId.set(userId, displayName);
    }
    presenceIndex.add(userId, { kind: "LOBBY" }, displayName);
    this.sendLobbyMessage(client, "ONLINE_COUNT", {
      totalOnline: presenceIndex.getTotalOnline(),
    });
  }

  onLeave(client: { sessionId: string }): void {
    const userId = this.userIdBySessionId.get(client.sessionId);
    this.userIdBySessionId.delete(client.sessionId);
    if (userId) {
      this.sessionIdByUserId.delete(userId);
      this.displayNameByUserId.delete(userId);
      this.lobbyChatLastSendAtByUserId.delete(userId);
      this.lobbyChatBurstByUserId.delete(userId);
      this.lobbyVoiceParticipants.delete(userId);
      this.broadcastLobbyVoiceParticipants();
      presenceIndex.remove(userId, { kind: "LOBBY" });
    }
  }

  async pushTableListUpdate() {
    const tables = await this.queryTables();
    this.broadcastLobbyMessage("TABLE_LIST", { tables });
  }

  onCreate() {
    this.unsubscribePresence = presenceIndex.subscribe((totalOnline) => {
      if (this.onlineCountBroadcastTimer) {
        clearTimeout(this.onlineCountBroadcastTimer);
      }
      this.onlineCountBroadcastTimer = setTimeout(() => {
        this.broadcastLobbyMessage("ONLINE_COUNT", { totalOnline });
        this.onlineCountBroadcastTimer = null;
      }, 100);
    });

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

    this.onMessage("LIST_ONLINE_PLAYERS", (client, message) => {
      const inbound = LobbyInboundMessageSchema.safeParse({ type: "LIST_ONLINE_PLAYERS", payload: message });
      if (!inbound.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: inbound.error.flatten() });
        return;
      }

      this.sendLobbyMessage(client, "ONLINE_PLAYERS", {
        totalOnline: presenceIndex.getTotalOnline(),
        generatedAt: Date.now(),
        players: presenceIndex.getPlayersSnapshot(),
      });
    });

    this.onMessage("JOIN_LOBBY_VOICE", (client) => {
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) return;
      if (this.lobbyVoiceParticipants.size >= LOBBY_VOICE_CAP && !this.lobbyVoiceParticipants.has(userId)) {
        this.sendLobbyMessage(client, "ERROR", { code: "LOBBY_VOICE_FULL", message: "Lobby voice is full." });
        return;
      }
      this.lobbyVoiceParticipants.add(userId);
      this.broadcastLobbyVoiceParticipants();
    });

    this.onMessage("LEAVE_LOBBY_VOICE", (client) => {
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) return;
      this.lobbyVoiceParticipants.delete(userId);
      this.broadcastLobbyVoiceParticipants();
    });

    this.onMessage("SEND_LOBBY_CHAT", async (client, message) => {
      const parsedPayload = LOBBY_CHAT_SEND_SCHEMA.safeParse(message);
      if (!parsedPayload.success) {
        this.sendLobbyMessage(client, "ERROR", { code: "BAD_MESSAGE", details: parsedPayload.error.flatten() });
        return;
      }

      const userId = this.userIdBySessionId.get(client.sessionId);
      if (!userId) {
        this.sendLobbyMessage(client, "ERROR", { code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const now = Date.now();
      if (!this.canSendLobbyChat(userId, now)) {
        this.sendLobbyMessage(client, "ERROR", { code: "RATE_LIMITED", message: "Too many messages. Slow down." });
        return;
      }

      const text = parsedPayload.data.text.trim();
      const senderName = this.displayNameByUserId.get(userId) ?? `Player-${userId.slice(0, 4)}`;

      try {
        const prisma = getPrisma() as any;
        const row = await prisma.lobbyChatMessage.create({
          data: {
            id: nanoid(),
            scope: "lobby",
            senderUserId: userId,
            senderName,
            text,
          },
          select: {
            id: true,
            scope: true,
            senderUserId: true,
            senderName: true,
            text: true,
            createdAt: true,
          },
        });

        this.broadcastLobbyMessage("LOBBY_CHAT_MESSAGE", {
          id: row.id,
          scope: row.scope,
          senderUserId: row.senderUserId,
          senderName: row.senderName,
          text: row.text,
          createdAtTs: row.createdAt.getTime(),
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to persist lobby chat message");
        this.sendLobbyMessage(client, "ERROR", { code: "CHAT_PERSIST_FAILED", message: "Failed to send message." });
      }
    });

    this.onMessage("VOICE_SIGNAL", (client, payload: unknown) => {
      const msg = payload as Record<string, unknown> | null;
      if (!msg || msg.channelId !== LOBBY_VOICE_CHANNEL_ID) {
        logger.warn({ payload: msg }, "Rejected VOICE_SIGNAL with invalid lobby channel");
        return;
      }
      const fromUserId = msg.fromUserId;
      if (typeof fromUserId !== "string" || !fromUserId) return;
      const expectedSessionId = this.sessionIdByUserId.get(fromUserId);
      if (!expectedSessionId || expectedSessionId !== client.sessionId) {
        return;
      }
      const toUserId = msg.toUserId;
      if (typeof toUserId !== "string" || !toUserId) return;
      if (fromUserId === toUserId) return;
      if (!this.lobbyVoiceParticipants.has(fromUserId) || !this.lobbyVoiceParticipants.has(toUserId)) return;
      const targetSessionId = this.sessionIdByUserId.get(toUserId);
      if (!targetSessionId) return;
      const targetClient = this.clients.find((c) => c.sessionId === targetSessionId);
      if (targetClient) targetClient.send("VOICE_SIGNAL", payload);
    });
  }

  private broadcastLobbyVoiceParticipants(): void {
    this.broadcastLobbyMessage("LOBBY_VOICE_PARTICIPANTS", {
      userIds: Array.from(this.lobbyVoiceParticipants),
      serverNowTs: Date.now(),
    });
  }

  onDispose(): void {
    if (this.onlineCountBroadcastTimer) {
      clearTimeout(this.onlineCountBroadcastTimer);
      this.onlineCountBroadcastTimer = null;
    }
    this.unsubscribePresence?.();
    this.unsubscribePresence = undefined;

    for (const userId of this.userIdBySessionId.values()) {
      presenceIndex.remove(userId, { kind: "LOBBY" });
    }
    this.userIdBySessionId.clear();
    this.sessionIdByUserId.clear();
    this.displayNameByUserId.clear();
    this.lobbyChatLastSendAtByUserId.clear();
    this.lobbyChatBurstByUserId.clear();
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
      const humanCount = typeof m.humanCount === "number" ? m.humanCount : undefined;
      const connectedHumanCount = typeof m.connectedHumanCount === "number" ? m.connectedHumanCount : undefined;
      const summary: LobbyTableSummary & { passwordHash?: string } = {
        tableId: (m.tableId as string) ?? r.roomId ?? "",
        roomId: r.roomId ?? "",
        name: (m.name as string) ?? "Hold'em",
        players: connectedHumanCount ?? humanCount ?? r.clients ?? 0,
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
        humanCount,
        connectedHumanCount,
      };
      if (includePrivateHash) summary.passwordHash = m.passwordHash as string | undefined;
      return summary;
    }).sort((a, b) => (b.players - a.players) || (b.createdAt - a.createdAt));
  }

  private canSendLobbyChat(userId: string, nowTs: number): boolean {
    const minIntervalMs = 800;
    const burstWindowMs = 10_000;
    const burstLimit = 5;
    const lastSendAt = this.lobbyChatLastSendAtByUserId.get(userId) ?? 0;
    if (nowTs - lastSendAt < minIntervalMs) return false;

    const recent = (this.lobbyChatBurstByUserId.get(userId) ?? []).filter((ts) => nowTs - ts <= burstWindowMs);
    if (recent.length >= burstLimit) return false;
    recent.push(nowTs);
    this.lobbyChatBurstByUserId.set(userId, recent);
    this.lobbyChatLastSendAtByUserId.set(userId, nowTs);
    return true;
  }
}
