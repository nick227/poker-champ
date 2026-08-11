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

/**
 * Finalizes a rebuy-pending registration as eliminated. Shared by the timeout sweep below and by
 * the player-initiated "leave tournament" action. `updateMany` (not `update`) lets the where clause
 * re-check `rebuyPendingAt`/`finishPlace` at write time, so a lost race against a concurrent call
 * (sweep vs. explicit leave for the same user) is a no-op (count 0) instead of a double-elimination
 * or a duplicate `finishPlace` ordinal.
 */
export async function finalizeEliminatedRegistration(
  tournamentId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const pendingCount = await tx.tournamentRegistration.count({
      where: { tournamentId, finishPlace: null },
    });
    const result = await tx.tournamentRegistration.updateMany({
      where: { tournamentId, userId, rebuyPendingAt: { not: null }, finishPlace: null },
      data: {
        finishPlace: pendingCount,
        eliminatedAt: now,
        rebuyPendingAt: null,
      },
    });
    return result.count > 0;
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

    const finalized = await finalizeEliminatedRegistration(tournamentId, reg.userId, now);
    if (finalized) eliminated += 1;
  }
  return eliminated;
}
