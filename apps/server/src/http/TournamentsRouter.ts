import express from "express";
import { z } from "zod";
import { attachAuthIfPresent, requireAuth } from "../engine/auth/RequireAuth.js";
import { requireAdmin } from "../engine/auth/AdminMiddleware.js";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../engine/economy/CashierService.js";
import {
  DEFAULT_BLIND_STRUCTURE_ID,
  DEFAULT_STARTING_STACK_CENTS,
  isTournamentBlindStructureId,
  tournamentCancelExternalRef,
  tournamentEntryExternalRef,
  tournamentRefundExternalRef,
} from "../tournaments/tournament.constants.js";
import { TOURNAMENT_CLIENT_ERRORS } from "../tournaments/tournament.errors.js";
import { isTournamentRoomLive, loadLivePokerRoomIds } from "../tournaments/tournament-room-live.js";
import { toTournamentResponse } from "../tournaments/tournament.serialize.js";
import { loadTournamentStandings } from "../tournaments/tournament-standings.js";

const router = express.Router();

const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(120),
  entryFeeCents: z.number().int().positive(),
  startTime: z.string().datetime(),
  maxPlayers: z.number().int().min(2).max(9),
  startingStackCents: z.number().int().positive().default(DEFAULT_STARTING_STACK_CENTS),
  blindStructureId: z.string().refine(isTournamentBlindStructureId, {
    message: "Invalid blindStructureId",
  }).default(DEFAULT_BLIND_STRUCTURE_ID),
  lateRegMinutes: z.number().int().min(0).max(120).default(0),
  fillBotsAtStart: z.boolean().default(false),
  fillBotCount: z.number().int().min(1).max(8).optional(),
});

const tournamentInclude = {
  _count: {
    select: { registrations: true },
  },
} as const;

function tournamentErrorStatus(message: string): number {
  return TOURNAMENT_CLIENT_ERRORS.has(message) ? 400 : 500;
}

router.get("/", attachAuthIfPresent, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const prisma = getPrisma();
  const tournaments = await prisma.tournament.findMany({
    where: status ? { status } : undefined,
    orderBy: { startTime: "asc" },
    include: tournamentInclude,
  });

  const registeredIds = new Set<string>();
  if (req.user && tournaments.length > 0) {
    const regs = await prisma.tournamentRegistration.findMany({
      where: {
        userId: req.user.id,
        tournamentId: { in: tournaments.map((t) => t.id) },
      },
      select: { tournamentId: true },
    });
    for (const reg of regs) {
      registeredIds.add(reg.tournamentId);
    }
  }

  const liveRoomIds = await loadLivePokerRoomIds();

  res.json({
    tournaments: tournaments.map((t) =>
      toTournamentResponse(t, {
        isRegistered: req.user ? registeredIds.has(t.id) : undefined,
        tableLive:
          t.status === "STARTING" || t.status === "RUNNING"
            ? isTournamentRoomLive(t.roomId, liveRoomIds)
            : undefined,
      }),
    ),
  });
});

router.get("/:id/standings", async (req, res) => {
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

  const standings = await loadTournamentStandings(id);
  res.json({ standings });
});

router.get("/:id", attachAuthIfPresent, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "Tournament id is required" });
    return;
  }

  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: tournamentInclude,
  });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  let isRegistered: boolean | undefined;
  if (req.user) {
    const reg = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: req.user.id } },
    });
    isRegistered = Boolean(reg);
  }

  const liveRoomIds = await loadLivePokerRoomIds();
  res.json(
    toTournamentResponse(tournament, {
      isRegistered,
      tableLive:
        tournament.status === "STARTING" || tournament.status === "RUNNING"
          ? isTournamentRoomLive(tournament.roomId, liveRoomIds)
          : undefined,
    }),
  );
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
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
      maxPlayers: parsed.data.maxPlayers,
      startingStackCents: parsed.data.startingStackCents,
      blindStructureId: parsed.data.blindStructureId,
      lateRegMinutes: parsed.data.lateRegMinutes,
      fillBotsAtStart: parsed.data.fillBotsAtStart,
      fillBotCount: parsed.data.fillBotCount ?? null,
      status: "REGISTERING",
    },
    include: tournamentInclude,
  });
  res.status(201).json(toTournamentResponse(tournament));
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
      externalRef: tournamentEntryExternalRef(tournament.id, req.user!.id),
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament registration failed";
    res.status(tournamentErrorStatus(message)).json({ error: message });
  }
});

router.post("/:id/unregister", requireAuth, async (req, res) => {
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
    const result = await CashierService.processTournamentRefund({
      userId: req.user!.id,
      tournamentId: tournament.id,
      entryFeeCents: tournament.entryFeeCents,
      externalRef: tournamentRefundExternalRef(tournament.id, req.user!.id),
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament unregister failed";
    res.status(tournamentErrorStatus(message)).json({ error: message });
  }
});

router.post("/:id/cancel", requireAuth, requireAdmin, async (req, res) => {
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
    const result = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId: req.user!.id,
      externalRef: tournamentCancelExternalRef(tournament.id),
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament cancel failed";
    res.status(tournamentErrorStatus(message)).json({ error: message });
  }
});

export const tournamentsRouter = router;
