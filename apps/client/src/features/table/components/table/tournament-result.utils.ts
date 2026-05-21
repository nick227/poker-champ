export type TournamentResultTier = "champion" | "podium" | "none";

export function formatFinishPlace(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

export function getTournamentResultTier(
  finishPlace: number | null | undefined,
  payoutCents: number,
): TournamentResultTier {
  if (payoutCents <= 0 || finishPlace == null) return "none";
  if (finishPlace === 1) return "champion";
  return "podium";
}

export function shouldShowTournamentResultOverlay(
  isEliminated: boolean | undefined,
  tournamentStatus: string,
): boolean {
  return (
    isEliminated === true ||
    tournamentStatus === "FINISHED" ||
    tournamentStatus === "ABANDONED"
  );
}

export function buildTournamentResultRevealKey(
  tournamentId: string,
  finishPlace: number | null | undefined,
  payoutCents: number,
): string {
  return `${tournamentId}:${finishPlace ?? "—"}:${payoutCents}`;
}
