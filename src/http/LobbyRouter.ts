import express from "express";
import { matchMaker } from "@colyseus/core";
import { buildTableConfig } from "../lobby/TableManager.js";
import { CreateTableSchema } from "../lobby/schemas.js";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

router.get("/tables", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "poker" });
  const tables = rooms.map((r: { metadata?: Record<string, unknown>; roomId?: string; clients?: number; maxClients?: number }) => {
    const metadata = r.metadata ?? {};
    const humanCount = typeof metadata.humanCount === "number" ? metadata.humanCount : undefined;
    const connectedHumanCount = typeof metadata.connectedHumanCount === "number" ? metadata.connectedHumanCount : undefined;
    return {
      tableId: metadata.tableId ?? r.roomId,
      roomId: r.roomId,
      name: metadata.name ?? "Hold'em",
      players: connectedHumanCount ?? humanCount ?? r.clients ?? 0,
      maxSeats: metadata.maxSeats ?? r.maxClients ?? 9,
      smallBlindCents: metadata.smallBlindCents ?? 50,
      bigBlindCents: metadata.bigBlindCents ?? 100,
      minBuyInCents: metadata.minBuyInCents ?? 2000,
      maxBuyInCents: metadata.maxBuyInCents ?? 20000,
      visibility: metadata.visibility ?? "PUBLIC",
      speed: metadata.speed ?? "normal",
      runningSince: metadata.runningSince ?? null,
      createdAt: metadata.createdAt ?? Date.now(),
      creatorId: metadata.creatorId != null ? String(metadata.creatorId) : undefined,
      humanCount,
      connectedHumanCount,
    };
  });
  res.json({ tables });
});

router.post("/tables", requireAuth, async (req, res) => {
  const parsed = CreateTableSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid table config", details: parsed.error.flatten() });
    return;
  }

  const { user } = req;
  const creatorId = user?.id != null ? String(user.id) : undefined;
  const config = await buildTableConfig({ ...parsed.data, creatorId });
  const created = await matchMaker.createRoom("poker", { tableConfig: config });
  const roomId =
    typeof created === "string"
      ? created
      : (created as { roomId?: string } | null | undefined)?.roomId;

  if (!roomId) {
    res.status(500).json({ error: "Failed to create table room" });
    return;
  }

  try {
    const lobbyRooms = await matchMaker.query({ name: "lobby" });
    await Promise.allSettled(
      lobbyRooms.map(async (r: { roomId?: string }) => {
        const lobbyRoomId = r.roomId;
        if (!lobbyRoomId) return;
        await matchMaker.remoteRoomCall(lobbyRoomId, "pushTableListUpdate" as never, [], 5000);
      }),
    );
  } catch (err) {
    logger.warn({ err, tableId: config.tableId }, "Failed to push lobby table list update after table creation");
  }

  res.status(201).json({ tableId: config.tableId, roomId });
});

router.delete("/tables/:tableId", requireAuth, async (req, res) => {
  const tableId = typeof req.params.tableId === "string" ? req.params.tableId : req.params.tableId?.[0];
  const userId = req.user?.id;
  if (!tableId || !userId) {
    res.status(400).json({ error: "Missing tableId or auth" });
    return;
  }

  type PokerRoomRef = { roomId?: string; metadata?: { tableId?: string; creatorId?: string; humanCount?: number; connectedHumanCount?: number } };
  const rooms = await matchMaker.query({ name: "poker" }) as PokerRoomRef[];
  const room = rooms.find(
    (r) => (r.metadata?.tableId ?? r.roomId) === tableId
  );

  if (!room?.roomId) {
    res.status(204).send();
    return;
  }

  const creatorId = room.metadata?.creatorId;
  if (!creatorId || String(creatorId) !== String(userId)) {
    res.status(403).json({ error: "Only the table creator can delete this table" });
    return;
  }

  const connectedHumanCount = room.metadata?.connectedHumanCount ?? 0;
  if (connectedHumanCount !== 0) {
    res.status(409).json({ error: "Table can only be deleted when no human players are connected" });
    return;
  }

  const resolvedTableId = (room.metadata?.tableId as string) ?? room.roomId ?? tableId;
  const { TableSeatSessionService } = await import("../engine/seats/TableSeatSessionService.js");
  try {
    await TableSeatSessionService.markAllLeftForTable({ tableId: resolvedTableId });
    await matchMaker.remoteRoomCall(room.roomId, "requestDisconnect", [], 5000);
  } catch (err) {
    logger.warn({ err, tableId, roomId: room.roomId }, "requestDisconnect failed");
    res.status(500).json({ error: "Failed to close table" });
    return;
  }

  try {
    const lobbyRooms = await matchMaker.query({ name: "lobby" });
    await Promise.allSettled(
      lobbyRooms.map(async (r: { roomId?: string }) => {
        const lobbyRoomId = r.roomId;
        if (!lobbyRoomId) return;
        await matchMaker.remoteRoomCall(lobbyRoomId, "pushTableListUpdate" as never, [], 5000);
      }),
    );
  } catch (e) {
    logger.warn({ err: e, tableId }, "Failed to push lobby table list update after table delete");
  }

  res.status(204).send();
});

export const lobbyRouter = router;
