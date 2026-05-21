import express from "express";
import { matchMaker } from "@colyseus/core";
import { z } from "zod";
import { buildTableConfig } from "../lobby/TableManager.js";
import { CreateTableSchema } from "../lobby/schemas.js";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { logger } from "../lib/logger.js";
import { getPrisma } from "@poker-champ/db";
import { isTournamentTableMetadata } from "../tournaments/lobby-table-filter.js";

const router = express.Router();
const InstantPresetIdSchema = z.enum(["MULTIPLAYER_RING", "HEADS_UP_BOT"]);
const LobbyChatQuerySchema = z.object({
  scope: z.string().min(1).default("lobby"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function encodeLobbyChatCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.getTime()}:${row.id}`;
}

function decodeLobbyChatCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const parts = cursor.split(":");
  if (parts.length !== 2) return null;
  const [createdAtMsRaw, id] = parts;
  if (!createdAtMsRaw || !id) return null;
  const createdAtMs = Number(createdAtMsRaw);
  if (!Number.isInteger(createdAtMs) || createdAtMs < 0) return null;
  const createdAt = new Date(createdAtMs);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

function logInstantGamePhase(phase: string, extra?: Record<string, unknown>): void {
  if (process.env.POKER_INSTANT_GAME_DEBUG !== "1") return;
  const memory = process.memoryUsage();
  logger.info(
    {
      phase,
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      rssMB: Math.round(memory.rss / 1024 / 1024),
      ...extra,
    },
    "INSTANT_GAME_HTTP_PHASE",
  );
}

router.get("/tables", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "poker" });
  const cashRooms = rooms.filter(
    (r: { metadata?: Record<string, unknown> }) => !isTournamentTableMetadata(r.metadata),
  );
  const tables = cashRooms.map((r: { metadata?: Record<string, unknown>; roomId?: string; clients?: number; maxClients?: number }) => {
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
      updatedAt: metadata.updatedAt ?? metadata.createdAt ?? Date.now(),
      creatorId: metadata.creatorId != null ? String(metadata.creatorId) : undefined,
      creatorName: typeof metadata.creatorName === "string" && metadata.creatorName.length > 0 ? metadata.creatorName : "Player",
      creatorAvatarUrl: typeof metadata.creatorAvatarUrl === "string" ? metadata.creatorAvatarUrl : null,
      showStats: metadata.showStats ?? false,
      humanCount,
      connectedHumanCount,
      avgPotCents: typeof metadata.avgPotCents === "number" ? metadata.avgPotCents : undefined,
      waitlistCount: typeof metadata.waitlistCount === "number" ? metadata.waitlistCount : undefined,
    };
  });
  const creatorIds = [...new Set(tables.map((t: { creatorId?: string }) => t.creatorId).filter(Boolean))] as string[];
  const avatarByCreatorId = new Map<string, string | null>();
  if (creatorIds.length > 0) {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, avatarUrl: true },
    });
    for (const u of users) {
      avatarByCreatorId.set(u.id, u.avatarUrl ?? null);
    }
  }
  const enriched = tables.map((t: { creatorId?: string; creatorAvatarUrl?: string | null }) => {
    const avatar = t.creatorAvatarUrl ?? (t.creatorId ? avatarByCreatorId.get(t.creatorId) ?? null : null);
    return { ...t, creatorAvatarUrl: typeof avatar === "string" ? avatar : null };
  });
  res.json({ tables: enriched });
});

router.post("/tables", requireAuth, async (req, res) => {
  const parsed = CreateTableSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid table config", details: parsed.error.flatten() });
    return;
  }

  const { user } = req;
  const creatorId = user?.id != null ? String(user.id) : undefined;
  const creatorName = user?.displayName && user.displayName.length > 0 ? user.displayName : "Player";
  let creatorAvatarUrl: string | null = typeof user?.avatarUrl === "string" && user.avatarUrl.length > 0 ? user.avatarUrl : null;
  if (!creatorAvatarUrl && creatorId) {
    const creator = await getPrisma().user.findUnique({
      where: { id: creatorId },
      select: { avatarUrl: true },
    });
    creatorAvatarUrl = creator?.avatarUrl ?? null;
  }
  const config = await buildTableConfig({
    ...parsed.data,
    creatorId,
    creatorName,
    creatorAvatarUrl,
    showStats: parsed.data.showStats,
  });
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

router.post("/instant-games", requireAuth, async (req, res) => {
  const bodySchema = z.object({
    presetId: InstantPresetIdSchema,
    targetBotCount: z.number().int().min(0).max(9).optional(),
    config: z.unknown(),
  });
  const parsedBody = bodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid instant game payload", details: parsedBody.error.flatten() });
    return;
  }

  const createParsed = CreateTableSchema.safeParse(parsedBody.data.config ?? {});
  if (!createParsed.success) {
    res.status(400).json({ error: "Invalid table config", details: createParsed.error.flatten() });
    return;
  }

  const { user } = req;
  const creatorId = user?.id != null ? String(user.id) : undefined;
  const creatorName = user?.displayName && user.displayName.length > 0 ? user.displayName : "Player";
  let creatorAvatarUrl: string | null = typeof user?.avatarUrl === "string" && user.avatarUrl.length > 0 ? user.avatarUrl : null;
  if (!creatorAvatarUrl && creatorId) {
    const creator = await getPrisma().user.findUnique({
      where: { id: creatorId },
      select: { avatarUrl: true },
    });
    creatorAvatarUrl = creator?.avatarUrl ?? null;
  }

  const config = await buildTableConfig({
    ...createParsed.data,
    creatorId,
    creatorName,
    creatorAvatarUrl,
    showStats: createParsed.data.showStats,
    instantGameSeed: {
      presetId: parsedBody.data.presetId,
      targetBotCountOverride: parsedBody.data.targetBotCount,
    },
  });

  logInstantGamePhase("before_create_room", {
    presetId: parsedBody.data.presetId,
    targetBotCount: parsedBody.data.targetBotCount ?? null,
    tableId: config.tableId,
    maxSeats: config.maxSeats,
  });

  const created = await matchMaker.createRoom("poker", { tableConfig: config });
  const roomId =
    typeof created === "string"
      ? created
      : (created as { roomId?: string } | null | undefined)?.roomId;

  if (!roomId) {
    res.status(500).json({ error: "Failed to create table room" });
    return;
  }

  logInstantGamePhase("after_create_room", {
    presetId: parsedBody.data.presetId,
    targetBotCount: parsedBody.data.targetBotCount ?? null,
    tableId: config.tableId,
    roomId,
  });

  const seededBots = 0;
  const targetBots = typeof parsedBody.data.targetBotCount === "number" ? parsedBody.data.targetBotCount : null;
  logInstantGamePhase("before_seed_bots", {
    presetId: parsedBody.data.presetId,
    targetBotCount: parsedBody.data.targetBotCount ?? null,
    tableId: config.tableId,
    roomId,
    seedMode: "on_create",
  });

  res.status(201).json({
    tableId: config.tableId,
    roomId,
    presetId: parsedBody.data.presetId,
    seededBots,
    targetBots,
  });

  void (async () => {
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
      logger.warn({ err, tableId: config.tableId }, "Failed to push lobby table list update after instant game creation");
    }
  })();
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

  const initialConnectedHumanCount = room.metadata?.connectedHumanCount ?? 0;
  if (initialConnectedHumanCount !== 0) {
    res.status(409).json({ error: "Table can only be deleted when no human players are connected" });
    return;
  }

  const resolvedTableId = (room.metadata?.tableId as string) ?? room.roomId ?? tableId;
  const { TableSeatSessionService } = await import("../engine/seats/TableSeatSessionService.js");
  let deleteLockAcquired = false;
  try {
    const lockResult = await matchMaker.remoteRoomCall(
      room.roomId,
      "beginDeleteIfNoConnectedHumans" as never,
      [],
      5000,
    ) as { ok?: boolean; reason?: string; connectedHumanCount?: number } | undefined;
    if (!lockResult?.ok) {
      res.status(409).json({ error: "Table can only be deleted when no human players are connected" });
      return;
    }
    deleteLockAcquired = true;

    await TableSeatSessionService.markAllLeftForTable({ tableId: resolvedTableId });
    await matchMaker.remoteRoomCall(room.roomId, "requestDisconnect", [], 5000);
  } catch (err) {
    logger.warn({ err, tableId, roomId: room.roomId }, "requestDisconnect failed");
    if (deleteLockAcquired) {
      try {
        await matchMaker.remoteRoomCall(room.roomId, "cancelDelete" as never, [], 5000);
      } catch (cancelErr) {
        logger.warn({ err: cancelErr, tableId, roomId: room.roomId }, "cancelDelete failed after requestDisconnect error");
      }
    }
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

router.get("/chat/messages", requireAuth, async (req, res) => {
  const parsed = LobbyChatQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
    return;
  }

  const { scope, cursor, limit } = parsed.data;
  const decodedCursor = decodeLobbyChatCursor(cursor);
  if (cursor && !decodedCursor) {
    res.status(400).json({ error: "Invalid cursor format" });
    return;
  }

  try {
    const prisma = getPrisma();
    const rows = await prisma.lobbyChatMessage.findMany({
      where: {
        scope,
        ...(decodedCursor
          ? {
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                {
                  AND: [{ createdAt: decodedCursor.createdAt }, { id: { lt: decodedCursor.id } }],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        scope: true,
        senderUserId: true,
        senderName: true,
        text: true,
        createdAt: true,
      },
    });

    res.json({
      messages: rows.map((row) => ({
        id: row.id,
        scope: row.scope,
        senderUserId: row.senderUserId,
        senderName: row.senderName,
        text: row.text,
        createdAtTs: row.createdAt.getTime(),
      })),
      nextCursor: rows.length === limit ? encodeLobbyChatCursor(rows[rows.length - 1] as { createdAt: Date; id: string }) : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to list lobby chat messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

export const lobbyRouter = router;

