import express from "express";
import { z } from "zod";
import { attachAuthIfPresent, requireAuth } from "../engine/auth/RequireAuth.js";
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
import {
  TOURNAMENT_CANCEL_FORBIDDEN,
  TOURNAMENT_CLIENT_ERRORS,
  TOURNAMENT_REBUY_CONFIG_INVALID,
  TOURNAMENT_START_IN_PAST,
} from "../tournaments/tournament.errors.js";
import { logger } from "../lib/logger.js";
import { isTournamentRoomLive, loadLivePokerRoomIds } from "../tournaments/tournament-room-live.js";
import { assertTournamentCancelAllowed } from "../tournaments/tournament-cancel-auth.js";
import { tournamentDirector } from "../tournaments/TournamentDirector.js";
import {
  defaultLateRegMinutesForStructure,
  defaultRebuyPeriodMinutesForStructure,
  floorToMinute,
  isLateRegistrationOpen,
  isTournamentStartInPast,
} from "../tournaments/tournament-schedule.js";
import { toTournamentResponse } from "../tournaments/tournament.serialize.js";
import {
  resolveRegisteredTournamentPlayerStatus,
} from "../tournaments/tournament-player-status.js";
import { countTournamentRebuysForUser } from "../tournaments/tournament-rebuy.js";
import { loadTournamentStandings } from "../tournaments/tournament-standings.js";
import { tournamentTableBalancer } from "../tournaments/tournament-table-balancer.js";

const router = express.Router();

const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(120),
  entryFeeCents: z.number().int().positive(),
  startTime: z.string().datetime(),
  // Tournament-wide field cap, decoupled from per-table seat cap (MAX_SEATS_PER_TABLE = 9).
  // A field over 9 spans multiple TournamentTable rows; see docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md.
  maxPlayers: z.number().int().min(2).max(180),
  startingStackCents: z.number().int().positive().default(DEFAULT_STARTING_STACK_CENTS),
  blindStructureId: z.string().refine(isTournamentBlindStructureId, {
    message: "Invalid blindStructureId",
  }).default(DEFAULT_BLIND_STRUCTURE_ID),
  lateRegMinutes: z.number().int().min(0).max(120).optional(),
  fillBotsAtStart: z.boolean().default(false),
  fillBotCount: z.number().int().min(1).max(8).optional(),
  playFormat: z.enum(["FREEZEOUT", "REBUY"]).default("FREEZEOUT"),
  maxRebuysPerPlayer: z.number().int().min(0).max(10).default(0),
  rebuyPeriodMinutes: z.number().int().min(0).max(120).default(0),
  instantStart: z.boolean().default(false),
});

const tournamentInclude = {
  _count: {
    select: { registrations: true },
  },
  // MTT proposal Phase 5: multi-table indicator. Cheap (a handful of rows per tournament at most)
  // and omitted from the response entirely by toTournamentResponse for the common N<=1 case.
  tables: {
    select: { status: true },
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
  const registrationByTournamentId = new Map<
    string,
    { finishPlace: number | null; eliminatedAt: Date | null; rebuyPendingAt: Date | null }
  >();
  if (req.user && tournaments.length > 0) {
    const regs = await prisma.tournamentRegistration.findMany({
      where: {
        userId: req.user.id,
        tournamentId: { in: tournaments.map((t) => t.id) },
      },
      select: {
        tournamentId: true,
        finishPlace: true,
        eliminatedAt: true,
        rebuyPendingAt: true,
      },
    });
    for (const reg of regs) {
      registeredIds.add(reg.tournamentId);
      registrationByTournamentId.set(reg.tournamentId, {
        finishPlace: reg.finishPlace,
        eliminatedAt: reg.eliminatedAt,
        rebuyPendingAt: reg.rebuyPendingAt,
      });
    }
  }

  const liveRoomIds = await loadLivePokerRoomIds();

  const playerStatusByTournamentId = new Map<
    string,
    ReturnType<typeof resolveRegisteredTournamentPlayerStatus>
  >();
  if (req.user) {
    for (const t of tournaments) {
      const registration = registrationByTournamentId.get(t.id);
      if (!registration) continue;
      const rebuyCount = registration.rebuyPendingAt
        ? await countTournamentRebuysForUser(t.id, req.user.id)
        : 0;
      playerStatusByTournamentId.set(
        t.id,
        resolveRegisteredTournamentPlayerStatus(t, registration, rebuyCount),
      );
    }
  }

  res.json({
    tournaments: tournaments.map((t) => {
      const registration = registrationByTournamentId.get(t.id);
      const isRegistered = req.user ? registeredIds.has(t.id) : undefined;
      return toTournamentResponse(t, {
        isRegistered,
        isCreator: req.user ? t.createdByUserId === req.user.id : undefined,
        tableLive:
          t.status === "STARTING" || t.status === "LATE_REG" || t.status === "RUNNING"
            ? isTournamentRoomLive(t.roomId, liveRoomIds)
            : undefined,
        playerStatus: req.user && isRegistered ? playerStatusByTournamentId.get(t.id) : undefined,
      });
    }),
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
  let playerStatus: ReturnType<typeof resolveRegisteredTournamentPlayerStatus> | undefined;
  if (req.user) {
    const reg = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: req.user.id } },
      select: { finishPlace: true, eliminatedAt: true, rebuyPendingAt: true },
    });
    isRegistered = Boolean(reg);
    if (reg) {
      const rebuyCount = reg.rebuyPendingAt
        ? await countTournamentRebuysForUser(id, req.user.id)
        : 0;
      playerStatus = resolveRegisteredTournamentPlayerStatus(tournament, reg, rebuyCount);
    }
  }

  const liveRoomIds = await loadLivePokerRoomIds();
  res.json(
    toTournamentResponse(tournament, {
      isRegistered,
      playerStatus,
      isCreator: req.user ? tournament.createdByUserId === req.user.id : undefined,
      tableLive:
        tournament.status === "STARTING" ||
        tournament.status === "LATE_REG" ||
        tournament.status === "RUNNING"
          ? isTournamentRoomLive(tournament.roomId, liveRoomIds)
          : undefined,
    }),
  );
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = CreateTournamentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tournament payload", details: parsed.error.flatten() });
    return;
  }

  const now = new Date();
  const startTime = parsed.data.instantStart
    ? floorToMinute(now)
    : floorToMinute(new Date(parsed.data.startTime));

  if (!parsed.data.instantStart && isTournamentStartInPast(startTime, now)) {
    res.status(400).json({ error: TOURNAMENT_START_IN_PAST });
    return;
  }

  if (parsed.data.playFormat === "REBUY") {
    if (parsed.data.maxRebuysPerPlayer < 1) {
      res.status(400).json({ error: TOURNAMENT_REBUY_CONFIG_INVALID });
      return;
    }
    if (parsed.data.rebuyPeriodMinutes <= 0) {
      res.status(400).json({ error: TOURNAMENT_REBUY_CONFIG_INVALID });
      return;
    }
  }

  const rebuyPeriodMinutes =
    parsed.data.playFormat === "REBUY"
      ? parsed.data.rebuyPeriodMinutes > 0
        ? parsed.data.rebuyPeriodMinutes
        : defaultRebuyPeriodMinutesForStructure(parsed.data.blindStructureId)
      : 0;

  const prisma = getPrisma();
  const tournament = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      entryFeeCents: parsed.data.entryFeeCents,
      startTime,
      maxPlayers: parsed.data.maxPlayers,
      startingStackCents: parsed.data.startingStackCents,
      blindStructureId: parsed.data.blindStructureId,
      lateRegMinutes:
        parsed.data.lateRegMinutes ??
        defaultLateRegMinutesForStructure(parsed.data.blindStructureId),
      playFormat: parsed.data.playFormat,
      maxRebuysPerPlayer:
        parsed.data.playFormat === "REBUY" ? parsed.data.maxRebuysPerPlayer : 0,
      rebuyPeriodMinutes,
      fillBotsAtStart: parsed.data.fillBotsAtStart,
      fillBotCount: parsed.data.fillBotCount ?? null,
      status: "REGISTERING",
      createdByUserId: req.user!.id,
    },
    include: tournamentInclude,
  });
  if (parsed.data.instantStart) {
    try {
      await tournamentDirector.beginLateRegistration(tournament.id, now);
    } catch (err: unknown) {
      logger.error(
        {
          err,
          tournamentId: tournament.id,
          message: err instanceof Error ? err.message : String(err),
        },
        "TOURNAMENT_INSTANT_START_FAILED",
      );
    }
  }

  const created = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournament.id },
    include: tournamentInclude,
  });

  res.status(201).json(
    toTournamentResponse(created, { isCreator: true }),
  );
});

router.post("/:id/ensure-table", requireAuth, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "Tournament id is required" });
    return;
  }

  logger.info(
    { tournamentId: id, userId: req.user!.id, body: req.body ?? null },
    "TOURNAMENT_ENSURE_TABLE_REQUEST",
  );

  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    logger.warn(
      { tournamentId: id, userId: req.user!.id, body: req.body ?? null },
      "TOURNAMENT_ENSURE_TABLE_NOT_FOUND",
    );
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  try {
    const ensured = await tournamentDirector.ensureTournamentTableForJoinDetailed(id, req.user!.id);
    const refreshed = await prisma.tournament.findUnique({
      where: { id },
      include: tournamentInclude,
    });
    if (!refreshed) {
      logger.warn(
        { tournamentId: id, userId: req.user!.id, body: req.body ?? null },
        "TOURNAMENT_ENSURE_TABLE_NOT_FOUND",
      );
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    logger.info(
      {
        tournamentId: id,
        userId: req.user!.id,
        joinStatus: ensured.joinStatus,
        playerStatus: ensured.playerStatus,
        tableId: ensured.tableId,
        roomId: ensured.roomId,
        tableLive: ensured.tableLive,
        recoveryReason: ensured.recoveryReason,
      },
      "TOURNAMENT_ENSURE_TABLE_RESULT",
    );
    res.json({
      tournamentId: ensured.tournamentId,
      tournamentStatus: ensured.tournamentStatus,
      playerStatus: ensured.playerStatus,
      tableId: ensured.tableId,
      roomId: ensured.roomId,
      tableLive: ensured.tableLive,
      joinStatus: ensured.joinStatus,
      recoveryReason: ensured.recoveryReason,
      tournament: toTournamentResponse(refreshed, {
        isRegistered: true,
        tableLive: ensured.tableLive,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament table unavailable";
    res.status(tournamentErrorStatus(message)).json({ error: message });
  }
});

router.post("/:id/register", requireAuth, async (req, res) => {
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
  logger.info(
    {
      tournamentId: id,
      userId: req.user!.id,
      statusBefore: tournament?.status ?? "NOT_FOUND",
      registeredCount: tournament?._count?.registrations ?? null,
      lateRegOpen: tournament ? isLateRegistrationOpen(tournament) : false,
    },
    "TOURNAMENT_REGISTER_REQUEST",
  );
  if (!tournament) {
    logger.warn(
      {
        tournamentId: id,
        userId: req.user!.id,
        statusBefore: "NOT_FOUND",
        statusAfter: null,
        registeredCount: null,
        lateRegOpen: false,
      },
      "TOURNAMENT_REGISTER_RESULT",
    );
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
    await tournamentDirector.tryStartTournamentTable(tournament.id);
    await tournamentDirector.seatRegistrantOnAssignedTable(tournament.id, req.user!.id);
    const refreshed = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: tournamentInclude,
    });
    logger.info(
      {
        tournamentId: tournament.id,
        userId: req.user!.id,
        statusBefore: tournament.status,
        statusAfter: refreshed?.status ?? null,
        registeredCount: refreshed?._count?.registrations ?? null,
        lateRegOpen: refreshed ? isLateRegistrationOpen(refreshed) : false,
        tableId: refreshed?.tableId ?? null,
        roomId: refreshed?.roomId ?? null,
      },
      "TOURNAMENT_REGISTER_RESULT",
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament registration failed";
    logger.warn(
      {
        err,
        tournamentId: tournament.id,
        userId: req.user!.id,
        statusBefore: tournament.status,
        statusAfter: null,
        registeredCount: tournament._count?.registrations ?? null,
        lateRegOpen: isLateRegistrationOpen(tournament),
        message,
      },
      "TOURNAMENT_REGISTER_RESULT",
    );
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

router.post("/:id/cancel", requireAuth, async (req, res) => {
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

  const registeredCount = tournament._count?.registrations ?? 0;

  try {
    assertTournamentCancelAllowed({
      tournament,
      registeredCount,
      userId: req.user!.id,
      userRole: req.user!.role,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tournament cancel forbidden";
    const status = message === TOURNAMENT_CANCEL_FORBIDDEN ? 403 : 400;
    res.status(status).json({ error: message });
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

/**
 * Manual balance override (MTT proposal Phase 5): admin-only, force one rebalance move now
 * instead of waiting for the automatic post-hand trigger. Reuses the exact same fullest/emptiest
 * election and >1-gap threshold the automatic path uses -- this can't force a move the automatic
 * balancer wouldn't also eventually make on its own, it just doesn't wait for the next hand.
 */
router.post("/:id/rebalance", requireAuth, async (req, res) => {
  if (req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "Tournament id is required" });
    return;
  }

  const tournament = await getPrisma().tournament.findUnique({ where: { id }, select: { id: true } });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const result = await tournamentTableBalancer.forceRebalance(id);
  res.json(result);
});

export const tournamentsRouter = router;
