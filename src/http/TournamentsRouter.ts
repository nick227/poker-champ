import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../engine/auth/RequireAuth.js";
import { requireAdmin } from "../engine/auth/AdminMiddleware.js";
import { getPrisma } from "../db/prisma.js";
import { CashierService } from "../engine/economy/CashierService.js";

const router = express.Router();

const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(120),
  entryFeeCents: z.number().int().positive(),
  startTime: z.string().datetime(),
});

router.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const prisma = getPrisma();
  const tournaments = await prisma.tournament.findMany({
    where: status ? { status } : undefined,
    orderBy: { startTime: "asc" },
  });
  res.json({ tournaments });
});

router.get("/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "Tournament id is required" });
    return;
  }

  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      _count: {
        select: { registrations: true },
      },
    },
  });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.json(tournament);
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateTournamentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tournament payload", details: parsed.error.flatten() });
    return;
  }

  const prisma = getPrisma();
  const tournament = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      entryFeeCents: parsed.data.entryFeeCents,
      startTime: new Date(parsed.data.startTime),
      status: "REGISTERING",
    },
  });
  res.status(201).json(tournament);
});

router.post("/:id/register", requireAuth, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "Tournament id is required" });
    return;
  }

  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  try {
    const result = await CashierService.processTournamentRegister({
      userId: req.user!.id,
      tournamentId: tournament.id,
      entryFeeCents: tournament.entryFeeCents,
      externalRef: `tournament_${tournament.id}_${req.user!.id}_${nanoid(8)}`,
    });
    res.json(result);
  } catch (err: any) {
    const message = err?.message ?? "Tournament registration failed";
    if (message === "INSUFFICIENT_BANKROLL" || message === "TOURNAMENT_CLOSED") {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export const tournamentsRouter = router;
