import { getPrisma } from "@poker-champ/db";
import { awardService } from "../awards/AwardService.js";
import { evaluateTournamentAwards } from "../awards/evaluateTournamentAwards.js";
import { logger } from "../lib/logger.js";
import { recordTournamentPlayerResult } from "./tournament-user-stats.js";

export async function processTournamentFinishResults(tournamentId: string): Promise<void> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      status: true,
      registrations: {
        where: { finishPlace: { not: null } },
        select: { userId: true, finishPlace: true },
      },
    },
  });

  if (!tournament || tournament.status !== "FINISHED") return;
  if (tournament.registrations.length === 0) return;

  const payoutTxs = await prisma.balanceTransaction.findMany({
    where: { tournamentId, type: "TOURNAMENT_PAYOUT" },
    select: { userId: true, amountCents: true },
  });
  const payoutByUser = new Map<string, number>();
  for (const tx of payoutTxs) {
    payoutByUser.set(tx.userId, (payoutByUser.get(tx.userId) ?? 0) + tx.amountCents);
  }

  for (const reg of tournament.registrations) {
    const finishPlace = reg.finishPlace;
    if (finishPlace == null) continue;

    const payoutCents = payoutByUser.get(reg.userId) ?? 0;
    const { recorded, statsAfter } = await recordTournamentPlayerResult({
      tournamentId,
      userId: reg.userId,
      finishPlace,
      payoutCents,
    });

    if (!recorded) continue;

    logger.info(
      {
        tournamentId,
        userId: reg.userId,
        finishPlace,
        payoutCents,
        stats: statsAfter,
      },
      "TOURNAMENT_RESULT_PROCESSED",
    );

    const earnedAwardIds = await awardService.getEarnedAwardIds(reg.userId);
    const candidates = evaluateTournamentAwards(
      {
        tournamentId,
        tournamentName: tournament.name,
        finishPlace,
        payoutCents,
        tournamentsPlayedAfter: statsAfter.tournamentsPlayed,
      },
      earnedAwardIds,
    );
    if (candidates.length > 0) {
      await awardService.bulkGrant(reg.userId, candidates, { handId: tournamentId });
    }
  }
}
