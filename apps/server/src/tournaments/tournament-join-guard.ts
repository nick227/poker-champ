import { getPrisma } from "@poker-champ/db";
import { TOURNAMENT_JOIN_CLOSED, TOURNAMENT_NOT_REGISTERED } from "./tournament.errors.js";

export type TournamentJoinResolution =
  | { mode: "PLAY"; startingStackCents: number }
  | { mode: "SPECTATE"; finishPlace: number | null; payoutCents: number; rebuyPending?: boolean };

const OPEN_STATUSES = new Set(["STARTING", "LATE_REG", "RUNNING", "FINISHED"]);

export async function resolveTournamentJoin(params: {
  tournamentId: string;
  userId: string;
}): Promise<TournamentJoinResolution> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.tournamentId },
    select: {
      status: true,
      startingStackCents: true,
    },
  });

  if (!tournament || !OPEN_STATUSES.has(tournament.status)) {
    throw new Error(TOURNAMENT_JOIN_CLOSED);
  }

  const registration = await prisma.tournamentRegistration.findUnique({
    where: {
      tournamentId_userId: {
        tournamentId: params.tournamentId,
        userId: params.userId,
      },
    },
    select: {
      finishPlace: true,
      rebuyPendingAt: true,
    },
  });

  if (!registration) {
    throw new Error(TOURNAMENT_NOT_REGISTERED);
  }

  if (registration.rebuyPendingAt != null && registration.finishPlace == null) {
    return {
      mode: "SPECTATE",
      finishPlace: null,
      payoutCents: 0,
      rebuyPending: true,
    };
  }

  if (registration.finishPlace != null) {
    const payoutTx = await prisma.balanceTransaction.findFirst({
      where: {
        tournamentId: params.tournamentId,
        userId: params.userId,
        type: "TOURNAMENT_PAYOUT",
      },
      select: { amountCents: true },
    });
    return {
      mode: "SPECTATE",
      finishPlace: registration.finishPlace,
      payoutCents: payoutTx?.amountCents ?? 0,
    };
  }

  if (
    tournament.status !== "STARTING" &&
    tournament.status !== "LATE_REG" &&
    tournament.status !== "RUNNING"
  ) {
    throw new Error(TOURNAMENT_JOIN_CLOSED);
  }

  return { mode: "PLAY", startingStackCents: tournament.startingStackCents };
}

export async function assertTournamentJoinAllowed(params: {
  tournamentId: string;
  userId: string;
}): Promise<{ startingStackCents: number }> {
  const resolution = await resolveTournamentJoin(params);
  if (resolution.mode !== "PLAY") {
    throw new Error(TOURNAMENT_JOIN_CLOSED);
  }
  return { startingStackCents: resolution.startingStackCents };
}

export function isTournamentTableSpectator(params: {
  tournamentId: string | undefined;
  hasPlayer: (userId: string) => boolean;
  userId: string;
}): boolean {
  if (!params.tournamentId) return false;
  return !params.hasPlayer(params.userId);
}

