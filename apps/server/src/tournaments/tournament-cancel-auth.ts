import {
  TOURNAMENT_CANCEL_FORBIDDEN,
  TOURNAMENT_HAS_REGISTRATIONS,
  TOURNAMENT_NOT_CANCELLABLE,
} from "./tournament.errors.js";

type CancelAuthTournament = {
  status: string;
  createdByUserId: string | null;
};

export function assertTournamentCancelAllowed(params: {
  tournament: CancelAuthTournament;
  registeredCount: number;
  userId: string;
  userRole: string;
}): void {
  const { tournament, registeredCount, userId, userRole } = params;
  const isAdmin = userRole === "ADMIN";
  const isCreator = tournament.createdByUserId === userId;

  if (!isAdmin && !isCreator) {
    throw new Error(TOURNAMENT_CANCEL_FORBIDDEN);
  }

  if (isCreator && !isAdmin) {
    if (tournament.status !== "REGISTERING") {
      throw new Error(TOURNAMENT_NOT_CANCELLABLE);
    }
    if (registeredCount > 0) {
      throw new Error(TOURNAMENT_HAS_REGISTRATIONS);
    }
  }
}
