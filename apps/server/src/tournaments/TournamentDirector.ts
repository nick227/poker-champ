import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import type { Tournament } from "@prisma/client";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { computeNextLevelAt, getBlindLevel, getBlindLevels } from "./blind-structure.js";
import { tournamentCancelExternalRef } from "./tournament.constants.js";
import { fillTournamentBotRegistrations } from "./tournament-bot-fill.js";
import { parseTournamentBotCatalogId } from "./tournament-bot-users.js";
import { buildTournamentTableConfig } from "./tournament-table-config.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";

type TournamentWithRegistrations = Tournament & {
  registrations: { userId: string; isBot: boolean; user: { displayName: string } }[];
};

function resolveRoomId(created: unknown): string | undefined {
  if (typeof created === "string") return created;
  if (created && typeof created === "object" && "roomId" in created) {
    const roomId = (created as { roomId?: string }).roomId;
    return typeof roomId === "string" ? roomId : undefined;
  }
  return undefined;
}

export class TournamentDirector {
  async tick(now: Date = new Date()): Promise<void> {
    await this.processDueTournaments(now);
    await this.resumeStuckStartingTournaments(now);
    await this.reconcileOrphanRunningTournaments();
    await this.advanceDueBlindLevels(now);
  }

  /** Close RUNNING/STARTING tournaments whose Colyseus room no longer exists (e.g. after server restart). */
  async reconcileOrphanRunningTournaments(): Promise<void> {
    const prisma = getPrisma();
    const open = await prisma.tournament.findMany({
      where: {
        status: { in: ["STARTING", "RUNNING"] },
        roomId: { not: null },
      },
      take: 50,
    });
    if (open.length === 0) return;

    type PokerRoomRef = { roomId?: string };
    const rooms = (await matchMaker.query({ name: "poker" })) as PokerRoomRef[];
    const liveRoomIds = new Set(
      rooms.map((r) => r.roomId).filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    for (const tournament of open) {
      const roomId = tournament.roomId;
      if (!roomId || liveRoomIds.has(roomId)) continue;

      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "FINISHED", finishedAt: new Date() },
      });
      try {
        await processTournamentFinishResults(tournament.id);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_ORPHAN_FINISH_RESULTS_FAILED",
        );
      }
      logger.info({ tournamentId: tournament.id, roomId }, "TOURNAMENT_ORPHAN_CLOSED");
    }
  }

  async processDueTournaments(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const due = await prisma.tournament.findMany({
      where: {
        status: "REGISTERING",
        startTime: { lte: now },
      },
      orderBy: { startTime: "asc" },
      take: 20,
    });

    for (const tournament of due) {
      try {
        await this.processTournament(tournament.id, now);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_DIRECTOR_PROCESS_FAILED",
        );
      }
    }
  }

  async resumeStuckStartingTournaments(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const stuck = await prisma.tournament.findMany({
      where: {
        status: "STARTING",
        startTime: { lte: now },
        roomId: null,
      },
      take: 10,
    });

    for (const row of stuck) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: row.id },
        include: {
          registrations: {
            include: { user: { select: { displayName: true } } },
          },
        },
      });
      if (!tournament || tournament.registrations.length < 2) continue;
      try {
        await this.startTournamentWithTable(tournament);
        logger.info({ tournamentId: tournament.id }, "TOURNAMENT_STARTING_RESUMED");
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_STARTING_RESUME_FAILED",
        );
      }
    }
  }

  async processTournament(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const claimed = await prisma.tournament.updateMany({
      where: { id: tournamentId, status: "REGISTERING", startTime: { lte: now } },
      data: { status: "STARTING" },
    });
    if (claimed.count !== 1) return;

    let tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });
    if (!tournament) return;

    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournamentId);
      tournament =
        (await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: {
            registrations: {
              include: { user: { select: { displayName: true } } },
            },
          },
        })) ?? null;
      if (!tournament) return;
    }

    const registeredCount = tournament.registrations.length;
    if (registeredCount < 2) {
      if (registeredCount === 0) {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: "CANCELLED", prizePoolCents: 0 },
        });
      } else {
        await CashierService.processTournamentCancel({
          tournamentId,
          adminUserId: tournament.registrations[0]!.userId,
          externalRef: tournamentCancelExternalRef(tournamentId),
        });
      }
      logger.info({ tournamentId, registeredCount }, "TOURNAMENT_AUTO_CANCELLED_LOW_ENTRIES");
      return;
    }

    await this.startTournamentWithTable(tournament);
  }

  private async startTournamentWithTable(tournamentInput: TournamentWithRegistrations): Promise<void> {
    const prisma = getPrisma();
    let tournament = tournamentInput;
    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournament.id);
      tournament =
        (await prisma.tournament.findUnique({
          where: { id: tournament.id },
          include: {
            registrations: {
              include: { user: { select: { displayName: true } } },
            },
          },
        })) ?? tournament;
    }

    const level = getBlindLevel(tournament.blindStructureId, 1);
    const nextLevelAt = computeNextLevelAt(new Date(), level);
    const tableConfig = buildTournamentTableConfig({
      tournamentId: tournament.id,
      name: tournament.name,
      maxPlayers: tournament.maxPlayers,
      startingStackCents: tournament.startingStackCents,
      blindStructureId: tournament.blindStructureId,
      level: 1,
    });

    const created = await matchMaker.createRoom("poker", { tableConfig });
    const roomId = resolveRoomId(created);
    if (!roomId) {
      throw new Error("TOURNAMENT_ROOM_CREATE_FAILED");
    }

    const humanSeats = tournament.registrations
      .filter((reg) => !reg.isBot)
      .map((reg) => ({
        userId: reg.userId,
        displayName: reg.user.displayName,
      }));
    const botSeats = tournament.registrations
      .filter((reg) => reg.isBot)
      .map((reg) => {
        const catalogBotId = parseTournamentBotCatalogId(reg.userId);
        if (!catalogBotId) {
          throw new Error(`TOURNAMENT_BOT_CATALOG_ID_MISSING:${reg.userId}`);
        }
        return {
          userId: reg.userId,
          displayName: reg.user.displayName,
          catalogBotId,
        };
      });

    const humanSeed = (await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentPlayers" as never,
      [humanSeats, tournament.startingStackCents, tournament.id],
      30_000,
    )) as { ok?: boolean; seated?: number } | undefined;

    let botSeated = 0;
    if (botSeats.length > 0) {
      const botSeed = (await matchMaker.remoteRoomCall(
        roomId,
        "seedTournamentBots" as never,
        [botSeats, tournament.startingStackCents, tournament.id],
        30_000,
      )) as { ok?: boolean; seated?: number } | undefined;
      botSeated = botSeed?.seated ?? 0;
    }

    const seated = (humanSeed?.seated ?? 0) + botSeated;
    const seedResult = { ok: seated >= 2, seated };

    if (!seedResult?.ok) {
      logger.error(
        { tournamentId: tournament.id, roomId, seedResult },
        "TOURNAMENT_SEED_FAILED",
      );
      await CashierService.processTournamentCancel({
        tournamentId: tournament.id,
        adminUserId: tournament.registrations[0]?.userId ?? tournament.id,
        externalRef: `${tournamentCancelExternalRef(tournament.id)}_seed_fail`,
      });
      return;
    }

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        status: "RUNNING",
        tableId: tableConfig.tableId,
        roomId,
        currentLevel: 1,
        nextLevelAt,
      },
    });

    logger.info(
      {
        tournamentId: tournament.id,
        tableId: tableConfig.tableId,
        roomId,
        seated: seedResult.seated,
        registeredCount: tournament.registrations.length,
      },
      "TOURNAMENT_STARTED",
    );
  }

  async advanceDueBlindLevels(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const due = await prisma.tournament.findMany({
      where: {
        status: "RUNNING",
        nextLevelAt: { lte: now },
        roomId: { not: null },
      },
      take: 20,
    });

    for (const tournament of due) {
      try {
        await this.advanceBlindLevel(tournament.id, now);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_BLIND_ADVANCE_FAILED",
        );
      }
    }
  }

  async advanceBlindLevel(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.status !== "RUNNING" || !tournament.roomId) return;

    const levels = getBlindLevels(tournament.blindStructureId);
    const maxLevel = levels[levels.length - 1].level;
    const nextLevel = Math.min(tournament.currentLevel + 1, maxLevel);
    const level = getBlindLevel(tournament.blindStructureId, nextLevel);
    const nextLevelAt = computeNextLevelAt(now, level);

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        currentLevel: nextLevel,
        nextLevelAt,
      },
    });

    const applied = (await matchMaker.remoteRoomCall(
      tournament.roomId,
      "applyTournamentBlinds" as never,
      [
        {
          currentLevel: nextLevel,
          smallBlindCents: level.smallBlindCents,
          bigBlindCents: level.bigBlindCents,
          anteCents: level.anteCents,
          nextLevelAtTs: nextLevelAt.getTime(),
          status: tournament.status,
        },
      ],
      10_000,
    )) as { applied?: boolean } | undefined;

    logger.info(
      {
        tournamentId,
        roomId: tournament.roomId,
        currentLevel: nextLevel,
        applied: applied?.applied ?? false,
      },
      "TOURNAMENT_BLIND_LEVEL_ADVANCED",
    );
  }
}

export const tournamentDirector = new TournamentDirector();
