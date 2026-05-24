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

export function countTournamentSurvivorsWithChips(state: PokerState): string[] {
  const ids: string[] = [];
  for (const player of state.playersById.values()) {
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

function hasActiveHumanRegistrations(registrations: TournamentRegistrationRow[]): boolean {
  return registrations.some((r) => !r.isBot && r.finishPlace == null);
}

/** Close a freezeout when a single stack remains; bots can win only non-money challenge results. */
export function resolveTournamentWinnerUserId(
  state: PokerState,
  registrations: TournamentRegistrationRow[],
): string | null {
  const survivorsWithChips = countTournamentSurvivorsWithChips(state);
  if (survivorsWithChips.length === 1) {
    const soleSurvivorId = survivorsWithChips[0]!;
    const soleSurvivor = state.playersById.get(soleSurvivorId);
    if (soleSurvivor?.kind === "BOT" && hasActiveHumanRegistrations(registrations)) {
      return null;
    }
    return soleSurvivorId;
  }

  const humansWithChips = countHumanSurvivorsWithChips(state);
  if (humansWithChips.length === 0 && survivorsWithChips.length > 0) {
    if (hasActiveHumanRegistrations(registrations)) {
      return null;
    }
    const survivors = survivorsWithChips
      .map((id) => state.playersById.get(id))
      .filter((player) => player != null);
    survivors.sort((a, b) => b.stackCents - a.stackCents || a.seat - b.seat);
    return survivors[0]?.id ?? null;
  }
  return null;
}
