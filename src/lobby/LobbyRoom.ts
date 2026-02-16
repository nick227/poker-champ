import { Room } from "@colyseus/core";
import { matchMaker } from "@colyseus/core";
import { CreateTableSchema, JoinTableSchema } from "./schemas.js";
import { buildTableConfig, isPasswordValid } from "./TableManager.js";
import type { LobbyTableSummary } from "./types.js";
import { LobbyInboundMessageSchema, LobbyOutboundMessageSchema } from "@poker-champ/realtime-contract";
import { logger } from "../lib/logger.js";

type LobbyState = any;

export class LobbyRoom extends Room<LobbyState> {
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

      const cfg = await buildTableConfig(parsed.data);
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

      const tables = await this.queryTables();
      this.broadcastLobbyMessage("TABLE_LIST", { tables });
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

    return rooms.map((r: any) => {
      const m = r.metadata ?? {};
      const summary: any = {
        tableId: m.tableId ?? r.roomId,
        roomId: r.roomId,
        name: m.name ?? "Hold'em",
        players: r.clients ?? 0,
        maxSeats: m.maxSeats ?? r.maxClients ?? 9,
        smallBlindCents: m.smallBlindCents ?? 50,
        bigBlindCents: m.bigBlindCents ?? 100,
        minBuyInCents: m.minBuyInCents ?? 2000,
        maxBuyInCents: m.maxBuyInCents ?? 20000,
        visibility: m.visibility ?? "PUBLIC",
        runningSince: m.runningSince ?? undefined,
        createdAt: m.createdAt ?? Date.now(),
      };
      if (includePrivateHash) summary.passwordHash = m.passwordHash;
      return summary;
    }).sort((a, b) => (b.players - a.players) || (b.createdAt - a.createdAt));
  }
}
