import type { PokerState } from "../state/PokerState.js";
import { countHumanSurvivorsWithChips } from "./tournament-finish-resolution.js";

export type TournamentRegistrationFinishRow = {
  isBot: boolean;
  finishPlace: number | null;
};

/** Every registered human is eliminated (finish place set, no chips on table). */
export function isHumanFieldEliminated(
  registrations: TournamentRegistrationFinishRow[],
  state: PokerState,
): boolean {
  const humans = registrations.filter((r) => !r.isBot);
  if (humans.length === 0) return false;
  if (countHumanSurvivorsWithChips(state).length > 0) return false;
  return humans.every((r) => r.finishPlace != null);
}
