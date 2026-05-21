import { getPrisma } from "@poker-champ/db";

export type TournamentStandingRow = {
  userId: string;
  displayName: string;
  finishPlace: number | null;
  eliminatedAt: string | null;
  payoutCents: number;
  isBot: boolean;
};

export async function loadTournamentStandings(tournamentId: string): Promise<TournamentStandingRow[]> {
  const prisma = getPrisma();
  const [registrations, payoutTxs] = await Promise.all([
    prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: { user: { select: { displayName: true } } },
    }),
    prisma.balanceTransaction.findMany({
      where: { tournamentId, type: "TOURNAMENT_PAYOUT" },
      select: { userId: true, amountCents: true },
    }),
  ]);

  const payoutByUser = new Map<string, number>();
  for (const tx of payoutTxs) {
    payoutByUser.set(tx.userId, (payoutByUser.get(tx.userId) ?? 0) + tx.amountCents);
  }

  return registrations
    .map((reg) => ({
      userId: reg.userId,
      displayName: reg.user.displayName,
      finishPlace: reg.finishPlace,
      eliminatedAt: reg.eliminatedAt?.toISOString() ?? null,
      payoutCents: payoutByUser.get(reg.userId) ?? 0,
      isBot: reg.isBot,
    }))
    .sort((a, b) => {
      if (a.finishPlace == null && b.finishPlace == null) return 0;
      if (a.finishPlace == null) return 1;
      if (b.finishPlace == null) return -1;
      return a.finishPlace - b.finishPlace;
    });
}
