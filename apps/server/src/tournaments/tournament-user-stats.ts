import { randomUUID } from "node:crypto";
import { getPrisma } from "@poker-champ/db";
import { isTournamentBotUserId } from "./tournament-bot-users.js";

export type UserTournamentStatsSnapshot = {
  tournamentsPlayed: number;
  tournamentWins: number;
  tournamentCashes: number;
  tournamentEarningsCents: number;
};

const EMPTY_STATS: UserTournamentStatsSnapshot = {
  tournamentsPlayed: 0,
  tournamentWins: 0,
  tournamentCashes: 0,
  tournamentEarningsCents: 0,
};

export async function getUserTournamentStats(userId: string): Promise<UserTournamentStatsSnapshot> {
  if (isTournamentBotUserId(userId)) return { ...EMPTY_STATS };

  const prisma = getPrisma();
  const row = await prisma.userTournamentStats.findUnique({ where: { userId } });
  if (!row) return { ...EMPTY_STATS };
  return {
    tournamentsPlayed: row.tournamentsPlayed,
    tournamentWins: row.tournamentWins,
    tournamentCashes: row.tournamentCashes,
    tournamentEarningsCents: row.tournamentEarningsCents,
  };
}

export async function recordTournamentPlayerResult(params: {
  tournamentId: string;
  userId: string;
  finishPlace: number;
  payoutCents: number;
}): Promise<{ recorded: boolean; statsAfter: UserTournamentStatsSnapshot }> {
  if (isTournamentBotUserId(params.userId)) {
    return { recorded: false, statsAfter: { ...EMPTY_STATS } };
  }

  const prisma = getPrisma();
  const winDelta = params.finishPlace === 1 ? 1 : 0;
  const cashDelta = params.payoutCents > 0 ? 1 : 0;

  return prisma.$transaction(async (tx) => {
    try {
      await tx.tournamentPlayerResult.create({
        data: {
          tournamentId: params.tournamentId,
          userId: params.userId,
          finishPlace: params.finishPlace,
          payoutCents: params.payoutCents,
        },
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2002") {
        const existing = await tx.userTournamentStats.findUnique({ where: { userId: params.userId } });
        return {
          recorded: false,
          statsAfter: existing
            ? {
                tournamentsPlayed: existing.tournamentsPlayed,
                tournamentWins: existing.tournamentWins,
                tournamentCashes: existing.tournamentCashes,
                tournamentEarningsCents: existing.tournamentEarningsCents,
              }
            : { ...EMPTY_STATS },
        };
      }
      throw e;
    }

    const statsId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO UserTournamentStats (id, userId, tournamentsPlayed, tournamentWins, tournamentCashes, tournamentEarningsCents, updatedAt)
       VALUES (?, ?, 1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         tournamentsPlayed = tournamentsPlayed + 1,
         tournamentWins = tournamentWins + ?,
         tournamentCashes = tournamentCashes + ?,
         tournamentEarningsCents = tournamentEarningsCents + ?,
         updatedAt = NOW()`,
      statsId,
      params.userId,
      winDelta,
      cashDelta,
      params.payoutCents,
      winDelta,
      cashDelta,
      params.payoutCents,
    );

    const row = await tx.userTournamentStats.findUniqueOrThrow({ where: { userId: params.userId } });
    return {
      recorded: true,
      statsAfter: {
        tournamentsPlayed: row.tournamentsPlayed,
        tournamentWins: row.tournamentWins,
        tournamentCashes: row.tournamentCashes,
        tournamentEarningsCents: row.tournamentEarningsCents,
      },
    };
  });
}
