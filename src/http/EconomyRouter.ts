import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "../db/prisma.js";
import { CashierService } from "../engine/economy/CashierService.js";

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

router.post("/buy-in", async (req, res) => {
  const parsed = BuyInSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid buy-in payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await CashierService.processCashGameBuyIn({
      userId: req.user!.id,
      tableId: parsed.data.tableId,
      amountCents: parsed.data.amountCents,
      externalRef: parsed.data.externalRef ?? `buyin_${parsed.data.tableId}_${req.user!.id}`,
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "INSUFFICIENT_BANKROLL") {
      res.status(400).json({ error: err.message });
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
    const result = await CashierService.processCashGameCashOut({
      userId: req.user!.id,
      tableId: parsed.data.tableId,
      amountCents: parsed.data.amountCents,
      externalRef: parsed.data.externalRef ?? `cashout_${parsed.data.tableId}_${req.user!.id}`,
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "INSUFFICIENT_TABLE_BALANCE") {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err?.message ?? "Cash-out failed" });
  }
});

export const economyRouter = router;

