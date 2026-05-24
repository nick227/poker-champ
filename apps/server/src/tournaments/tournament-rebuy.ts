import { getPrisma } from "@poker-champ/db";
import { canRebuyTournament } from "./tournament-schedule.js";

export type TournamentRebuyContext = {
  playFormat: string;
  startTime: Date;
  rebuyPeriodMinutes: number;
  maxRebuysPerPlayer: number;
};

export function rebuyWindowClosesAtMs(tournament: {
  startTime: Date;
  rebuyPeriodMinutes: number;
}): number {
  return tournament.startTime.getTime() + tournament.rebuyPeriodMinutes * 60 * 1000;
}

export function countRebuyPendingRegistrations(
  registrations: { rebuyPendingAt: Date | null; finishPlace: number | null }[],
): number {
  return registrations.filter((r) => r.rebuyPendingAt != null && r.finishPlace == null).length;
}

export async function countTournamentRebuysForUser(
  tournamentId: string,
  userId: string,
): Promise<number> {
  const prisma = getPrisma();
  return prisma.balanceTransaction.count({
    where: { tournamentId, userId, type: "BUYIN" },
  });
}

export async function sweepExpiredRebuyPendingPlayers(
  tournamentId: string,
  tournament: TournamentRebuyContext,
  now: Date = new Date(),
): Promise<number> {
  const prisma = getPrisma();
  const pending = await prisma.tournamentRegistration.findMany({
    where: { tournamentId, rebuyPendingAt: { not: null }, finishPlace: null },
    select: { userId: true, isBot: true },
  });
  if (pending.length === 0) return 0;

  let eliminated = 0;
  for (const reg of pending) {
    if (reg.isBot) continue;
    const rebuyCount = await countTournamentRebuysForUser(tournamentId, reg.userId);
    if (canRebuyTournament(tournament, { rebuyCount }, now)) continue;

    const pendingCount = await prisma.tournamentRegistration.count({
      where: { tournamentId, finishPlace: null },
    });
    await prisma.tournamentRegistration.update({
      where: { tournamentId_userId: { tournamentId, userId: reg.userId } },
      data: {
        finishPlace: pendingCount,
        eliminatedAt: now,
        rebuyPendingAt: null,
      },
    });
    eliminated += 1;
  }
  return eliminated;
}
