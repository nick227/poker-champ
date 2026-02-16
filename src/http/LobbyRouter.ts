import express from "express";
import { matchMaker } from "@colyseus/core";
import { buildTableConfig } from "../lobby/TableManager.js";
import { CreateTableSchema } from "../lobby/schemas.js";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

router.get("/tables", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "poker" });
  const tables = rooms.map((r: any) => {
    const metadata = r.metadata ?? {};
    return {
      tableId: metadata.tableId ?? r.roomId,
      roomId: r.roomId,
      name: metadata.name ?? "Hold'em",
      players: r.clients ?? 0,
      maxSeats: metadata.maxSeats ?? r.maxClients ?? 9,
      smallBlindCents: metadata.smallBlindCents ?? 50,
      bigBlindCents: metadata.bigBlindCents ?? 100,
      minBuyInCents: metadata.minBuyInCents ?? 2000,
      maxBuyInCents: metadata.maxBuyInCents ?? 20000,
      visibility: metadata.visibility ?? "PUBLIC",
      speed: metadata.speed ?? "normal",
      runningSince: metadata.runningSince ?? null,
      createdAt: metadata.createdAt ?? Date.now(),
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

  const config = await buildTableConfig(parsed.data);
  const created = await matchMaker.createRoom("poker", { tableConfig: config });
  const roomId =
    typeof created === "string"
      ? created
      : (created as { roomId?: string } | null | undefined)?.roomId;

  if (!roomId) {
    res.status(500).json({ error: "Failed to create table room" });
    return;
  }

  // Push latest table list to all active lobby rooms so other users see new tables immediately.
  try {
    const lobbyRooms = await matchMaker.query({ name: "lobby" });
    await Promise.allSettled(
      lobbyRooms.map(async (room) => {
        const lobbyRoomId = (room as any)?.roomId;
        if (!lobbyRoomId) return;
        await matchMaker.remoteRoomCall<any>(lobbyRoomId, "pushTableListUpdate" as any, [], 5000);
      }),
    );
  } catch (err) {
    logger.warn({ err, tableId: config.tableId }, "Failed to push lobby table list update after table creation");
  }

  res.status(201).json({ tableId: config.tableId, roomId });
});

export const lobbyRouter = router;
