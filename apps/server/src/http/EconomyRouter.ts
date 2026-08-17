import express from "express";
import { matchMaker } from "@colyseus/core";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { getPrisma } from "@poker-champ/db";
import { CashierService, TABLE_NAME_REQUIRED } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { TOURNAMENT_REBUY_NOT_ALLOWED } from "../tournaments/tournament.errors.js";
import { isFakeDepositsEnabled } from "../config/features.js";

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
  if (!isFakeDepositsEnabled()) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

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

// Pre-existing handler (tournament vs cash-game branch, room/table metadata
// resolution, error-code mapping) extended with the Gap-3 bounded room-sync
// retry; the branch count mostly predates this change and reflects real
// distinct failure modes the client needs distinguishable error codes for.
// fallow-ignore-next-line complexity
router.post("/buy-in", async (req, res) => {
  const parsed = BuyInSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid buy-in payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const prisma = getPrisma();
    const activeTournament = await prisma.tournament.findFirst({
      where: {
        tableId: parsed.data.tableId,
        status: { in: ["LATE_REG", "STARTING", "RUNNING"] },
      },
      select: { id: true, playFormat: true },
    });
    if (activeTournament && activeTournament.playFormat !== "REBUY") {
      res.status(400).json({ error: TOURNAMENT_REBUY_NOT_ALLOWED });
      return;
    }

    const rooms = (await matchMaker.query({ name: "poker" })) as {
      roomId?: string;
      metadata?: { tableId?: string; name?: string; creatorId?: string };
    }[];
    const room = rooms.find((r) => (r.metadata?.tableId ?? r.roomId) === parsed.data.tableId);
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
    const rebuyRef =
      parsed.data.externalRef ?? `buyin_${parsed.data.tableId}_${req.user!.id}_${Date.now()}_${nanoid(6)}`;

    let cashAdmissionStarted = false;
    if (!activeTournament) {
      if (!room?.roomId) {
        res.status(409).json({ error: "TABLE_NOT_LIVE" });
        return;
      }
      let admission: { ok?: boolean; reason?: string };
      try {
        admission = await matchMaker.remoteRoomCall(
          room.roomId,
          "beginEconomicAdmission" as never,
          [req.user!.id, rebuyRef],
          5000,
        ) as { ok?: boolean; reason?: string };
      } catch {
        res.status(409).json({ error: "TABLE_NOT_LIVE" });
        return;
      }
      if (!admission?.ok) {
        res.status(409).json({ error: admission?.reason ?? "TABLE_NOT_ACCEPTING_BUYINS" });
        return;
      }
      cashAdmissionStarted = true;
    }

    try {
      const result = activeTournament
        ? await CashierService.processTournamentRebuy({
            userId: req.user!.id,
            tableId: parsed.data.tableId,
            tournamentId: activeTournament.id,
            amountCents: parsed.data.amountCents,
            externalRef: rebuyRef,
            tableMeta,
          })
        : await CashierService.processCashGameBuyIn({
            userId: req.user!.id,
            tableId: parsed.data.tableId,
            amountCents: parsed.data.amountCents,
            externalRef: rebuyRef,
            tableMeta,
          });
      const userId = req.user!.id;
      const { tableId, amountCents } = parsed.data;
      if (room?.roomId) {
        const { synced, attempts } = await CashierService.syncRoomAfterBuyIn({
          userId,
          tableId,
          externalRef: rebuyRef,
          roomSync: async () => {
            if (activeTournament) {
              const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { displayName: true },
              });
              const displayName = user?.displayName?.trim() || "Player";
              await matchMaker.remoteRoomCall(room.roomId!, "applyTournamentRebuy", [
                userId,
                displayName,
                amountCents,
                rebuyRef,
              ]);
            } else {
              await matchMaker.remoteRoomCall(room.roomId!, "applyRebuy", [userId, amountCents, rebuyRef]);
            }
          },
        });
        if (!synced) {
          logger.error(
            { tableId, userId, attempts, externalRef: rebuyRef },
            "applyRebuy to room failed after buy-in; exhausted retries, dead-lettered for manual reconciliation",
          );
          res.status(502).json({ error: "BUYIN_APPLIED_ROOM_SYNC_FAILED" });
          return;
        }
      }
      res.json(result);
    } finally {
      if (cashAdmissionStarted && room?.roomId) {
        try {
          await matchMaker.remoteRoomCall(
            room.roomId,
            "endEconomicAdmission" as never,
            [req.user!.id, rebuyRef],
            5000,
          );
        } catch (endErr) {
          logger.error(
            { err: endErr, tableId: parsed.data.tableId, roomId: room.roomId, externalRef: rebuyRef },
            "endEconomicAdmission failed",
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "INSUFFICIENT_BANKROLL") {
      res.status(400).json({ error: message });
      return;
    }
    if (message === TOURNAMENT_REBUY_NOT_ALLOWED) {
      res.status(400).json({ error: message });
      return;
    }
    if (message === TABLE_NAME_REQUIRED) {
      res.status(409).json({ error: "Table name metadata is required for buy-in." });
      return;
    }
    res.status(500).json({ error: message || "Buy-in failed" });
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

    // Cash-out participates in the same per-user admission synchronization as buy-in, rather
    // than a loose independent pre-check: this closes the TOCTOU window where a buy-in has
    // already committed PlayerBalance but has not yet synced room state (isUserSeated() would
    // still read false), which a plain seated-check alone cannot see. Held through the whole
    // ledger call so a concurrent buy-in also sees this cash-out in flight and refuses to start.
    let cashOutAdmissionStarted = false;
    if (room?.roomId) {
      let admission: { ok?: boolean; reason?: string };
      try {
        admission = (await matchMaker.remoteRoomCall(
          room.roomId,
          "beginCashOutAdmission" as never,
          [req.user!.id],
          5000,
        )) as { ok?: boolean; reason?: string };
      } catch (err) {
        logger.warn(
          { err, tableId: parsed.data.tableId, roomId: room.roomId, userId: req.user!.id },
          "beginCashOutAdmission failed; failing closed on cash-out",
        );
        res.status(409).json({ error: "TABLE_STATE_UNAVAILABLE" });
        return;
      }
      if (!admission?.ok) {
        res.status(409).json({ error: admission?.reason ?? "CASHOUT_NOT_ALLOWED" });
        return;
      }
      cashOutAdmissionStarted = true;
    }

    try {
      const cashOutRef =
        parsed.data.externalRef ??
        `cashout_${parsed.data.tableId}_${req.user!.id}_${Date.now()}_${nanoid(6)}`;

      const result = await CashierService.processCashGameCashOut({
        userId: req.user!.id,
        tableId: parsed.data.tableId,
        amountCents: parsed.data.amountCents,
        externalRef: cashOutRef,
        tableMeta,
      });
      res.json(result);
    } finally {
      if (cashOutAdmissionStarted && room?.roomId) {
        try {
          await matchMaker.remoteRoomCall(room.roomId, "endCashOutAdmission" as never, [req.user!.id], 5000);
        } catch (endErr) {
          logger.error(
            { err: endErr, tableId: parsed.data.tableId, roomId: room.roomId, userId: req.user!.id },
            "endCashOutAdmission failed",
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "INSUFFICIENT_TABLE_BALANCE") {
      res.status(400).json({ error: message });
      return;
    }
    if (message === TABLE_NAME_REQUIRED) {
      res.status(409).json({ error: "Table name metadata is required for cash-out." });
      return;
    }
    res.status(500).json({ error: message || "Cash-out failed" });
  }
});

export const economyRouter = router;
