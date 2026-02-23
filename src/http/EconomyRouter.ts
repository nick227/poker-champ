import express from "express";
import { matchMaker } from "@colyseus/core";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";
import { CashierService, TABLE_NAME_REQUIRED } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

const BuyInSchema = z.object({
  tableId: z.string().min(1),
  amountCents: z.number().int().positive(),
  externalRef: z.string().min(1).optional(),
});

const CashOutSchema = z.object({
  tableId: z.string().min(1),
  amountCents: z.number().int().positive(),
  externalRef: z.string().min(1).optional(),
});

router.use(requireAuth);

router.get("/wallet", async (req, res) => {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { bankrollCents: true },
  });
  res.json(user);
});

router.get("/transactions", async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
  const prisma = getPrisma();
  const items = await prisma.balanceTransaction.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ items });
});

router.post("/deposit", async (req, res) => {
  const DEPOSIT_CENTS = 100_000;
  const prisma = getPrisma();

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: req.user!.id },
      data: { bankrollCents: { increment: DEPOSIT_CENTS } },
      select: { bankrollCents: true },
    });

    await tx.balanceTransaction.create({
      data: {
        id: nanoid(),
        userId: req.user!.id,
        amountCents: DEPOSIT_CENTS,
        type: "DEPOSIT",
        externalRef: `deposit_${req.user!.id}_${Date.now()}_${nanoid(6)}`,
      },
    });

    return user;
  });

  res.json(updated);
});

router.post("/buy-in", async (req, res) => {
  const parsed = BuyInSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid buy-in payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const rooms = (await matchMaker.query({ name: "poker" })) as {
      roomId?: string;
      metadata?: { tableId?: string; name?: string; creatorId?: string };
    }[];
    const room = rooms.find((r) => (r.metadata?.tableId ?? r.roomId) === parsed.data.tableId);
    const prisma = getPrisma();
    const tableRow = await prisma.pokerTable.findUnique({
      where: { id: parsed.data.tableId },
      select: { name: true, creatorId: true },
    });
    const tableName = room?.metadata?.name ?? tableRow?.name;
    if (!tableName || tableName.trim().length === 0) {
      res.status(409).json({ error: "Table metadata unavailable; cannot process buy-in." });
      return;
    }
    const tableMeta = {
      name: tableName,
      creatorId: room?.metadata?.creatorId ?? tableRow?.creatorId ?? undefined,
    };
    const rebuyRef = parsed.data.externalRef ?? `buyin_${parsed.data.tableId}_${req.user!.id}`;

    const result = await CashierService.processCashGameBuyIn({
      userId: req.user!.id,
      tableId: parsed.data.tableId,
      amountCents: parsed.data.amountCents,
      externalRef: rebuyRef,
      tableMeta,
    });
    const userId = req.user!.id;
    const { tableId, amountCents } = parsed.data;
    try {
      if (room?.roomId) {
        await matchMaker.remoteRoomCall(room.roomId, "applyRebuy", [userId, amountCents, rebuyRef]);
      }
    } catch (roomErr) {
      logger.warn({ err: roomErr, tableId, userId }, "applyRebuy to room failed after buy-in");
    }
    res.json(result);
  } catch (err: any) {
    if (err?.message === "INSUFFICIENT_BANKROLL") {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err?.message === TABLE_NAME_REQUIRED) {
      res.status(409).json({ error: "Table name metadata is required for buy-in." });
      return;
    }
    res.status(500).json({ error: err?.message ?? "Buy-in failed" });
  }
});

router.post("/cash-out", async (req, res) => {
  const parsed = CashOutSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid cash-out payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const rooms = (await matchMaker.query({ name: "poker" })) as {
      roomId?: string;
      metadata?: { tableId?: string; name?: string; creatorId?: string };
    }[];
    const room = rooms.find((r) => (r.metadata?.tableId ?? r.roomId) === parsed.data.tableId);
    const prisma = getPrisma();
    const tableRow = await prisma.pokerTable.findUnique({
      where: { id: parsed.data.tableId },
      select: { name: true, creatorId: true },
    });
    const tableName = room?.metadata?.name ?? tableRow?.name;
    if (!tableName || tableName.trim().length === 0) {
      res.status(409).json({ error: "Table metadata unavailable; cannot process cash-out." });
      return;
    }
    const tableMeta = {
      name: tableName,
      creatorId: room?.metadata?.creatorId ?? tableRow?.creatorId ?? undefined,
    };

    const result = await CashierService.processCashGameCashOut({
      userId: req.user!.id,
      tableId: parsed.data.tableId,
      amountCents: parsed.data.amountCents,
      externalRef: parsed.data.externalRef ?? `cashout_${parsed.data.tableId}_${req.user!.id}`,
      tableMeta,
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "INSUFFICIENT_TABLE_BALANCE") {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err?.message === TABLE_NAME_REQUIRED) {
      res.status(409).json({ error: "Table name metadata is required for cash-out." });
      return;
    }
    res.status(500).json({ error: err?.message ?? "Cash-out failed" });
  }
});

export const economyRouter = router;
