export type TournamentPlayerStatus = "ACTIVE" | "ELIMINATED" | "WINNER" | "NOT_REGISTERED";

export function resolveTournamentPlayerStatus(input: {
  isRegistered: boolean;
  tournamentStatus: string;
  finishPlace: number | null;
  eliminatedAt: Date | null;
}): TournamentPlayerStatus {
  if (!input.isRegistered) {
    return "NOT_REGISTERED";
  }
  if (input.finishPlace === 1 && input.tournamentStatus === "FINISHED") {
    return "WINNER";
  }
  if (input.finishPlace != null && input.finishPlace > 1) {
    return "ELIMINATED";
  }
  if (input.eliminatedAt != null) {
    return "ELIMINATED";
  }
  return "ACTIVE";
}

export function isTournamentSpectateEligible(input: {
  tournamentStatus: string;
  tableId: string | null;
  roomId: string | null;
}): boolean {
  if (!input.tableId || !input.roomId) {
    return false;
  }
  return (
    input.tournamentStatus === "STARTING" ||
    input.tournamentStatus === "LATE_REG" ||
    input.tournamentStatus === "RUNNING"
  );
}
