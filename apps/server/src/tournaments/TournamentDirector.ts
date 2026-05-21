import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import type { Tournament } from "@prisma/client";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { computeNextLevelAt, getBlindLevel } from "./blind-structure.js";
import { tournamentCancelExternalRef } from "./tournament.constants.js";
import { buildTournamentTableConfig } from "./tournament-table-config.js";

type TournamentWithRegistrations = Tournament & {
  registrations: { userId: string; user: { displayName: string } }[];
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

  async processTournament(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const claimed = await prisma.tournament.updateMany({
      where: { id: tournamentId, status: "REGISTERING", startTime: { lte: now } },
      data: { status: "STARTING" },
    });
    if (claimed.count !== 1) return;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });
    if (!tournament) return;

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

  private async startTournamentWithTable(tournament: TournamentWithRegistrations): Promise<void> {
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

    const seats = tournament.registrations.map((reg) => ({
      userId: reg.userId,
      displayName: reg.user.displayName,
    }));

    const seedResult = (await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentPlayers" as never,
      [seats, tournament.startingStackCents, tournament.id],
      30_000,
    )) as { ok?: boolean; seated?: number } | undefined;

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

    const prisma = getPrisma();
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
}

export const tournamentDirector = new TournamentDirector();
