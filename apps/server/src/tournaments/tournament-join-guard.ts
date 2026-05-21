import { getPrisma } from "@poker-champ/db";
import { TOURNAMENT_JOIN_CLOSED, TOURNAMENT_NOT_REGISTERED } from "./tournament.errors.js";

export async function assertTournamentJoinAllowed(params: {
  tournamentId: string;
  userId: string;
}): Promise<{ startingStackCents: number }> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.tournamentId },
    select: {
      status: true,
      startingStackCents: true,
    },
  });

  if (!tournament) {
    throw new Error(TOURNAMENT_JOIN_CLOSED);
  }

  if (tournament.status !== "STARTING" && tournament.status !== "RUNNING") {
    throw new Error(TOURNAMENT_JOIN_CLOSED);
  }

  const registration = await prisma.tournamentRegistration.findUnique({
    where: {
      tournamentId_userId: {
        tournamentId: params.tournamentId,
        userId: params.userId,
      },
    },
  });

  if (!registration) {
    throw new Error(TOURNAMENT_NOT_REGISTERED);
  }

  return { startingStackCents: tournament.startingStackCents };
}
