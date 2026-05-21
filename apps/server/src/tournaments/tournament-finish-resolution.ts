import type { PokerState } from "../state/PokerState.js";

export type TournamentRegistrationRow = {
  userId: string;
  isBot: boolean;
  finishPlace: number | null;
};

export function countHumanSurvivorsWithChips(state: PokerState): string[] {
  const ids: string[] = [];
  for (const player of state.playersById.values()) {
    if (player.kind !== "HUMAN") continue;
    if (player.stackCents <= 0) continue;
    if (player.status === "OUT" || player.status === "ABANDONED") continue;
    ids.push(player.id);
  }
  return ids;
}

export function pickBestHumanFinisher(registrations: TournamentRegistrationRow[]): string | null {
  const ranked = registrations
    .filter((r) => !r.isBot && r.finishPlace != null)
    .sort((a, b) => (a.finishPlace ?? 0) - (b.finishPlace ?? 0));
  return ranked[0]?.userId ?? null;
}

/** When to close a freezeout: one human left with chips, or all humans busted. */
export function resolveTournamentWinnerUserId(
  state: PokerState,
  registrations: TournamentRegistrationRow[],
): string | null {
  const humansWithChips = countHumanSurvivorsWithChips(state);
  if (humansWithChips.length === 1) {
    return humansWithChips[0]!;
  }
  if (humansWithChips.length === 0) {
    return pickBestHumanFinisher(registrations);
  }
  return null;
}
