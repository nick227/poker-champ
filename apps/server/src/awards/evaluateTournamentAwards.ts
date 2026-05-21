import { awardCatalog, resolveReason } from "./awardCatalog.js";
import type { GrantCandidate } from "./types.js";

export type TournamentAwardInput = {
  tournamentId: string;
  tournamentName: string;
  finishPlace: number;
  payoutCents: number;
  tournamentsPlayedAfter: number;
};

export function evaluateTournamentAwards(
  input: TournamentAwardInput,
  earnedAwardIds: Set<string>,
): GrantCandidate[] {
  const { tournamentId, tournamentName, finishPlace, payoutCents, tournamentsPlayedAfter } = input;
  const params = { tournamentName };
  const candidates: GrantCandidate[] = [];

  const add = (awardId: string, triggerKey?: string) => {
    const entry = awardCatalog.getById(awardId);
    const reason = entry ? resolveReason(entry.reasonTemplate, params) : "";
    candidates.push({
      awardId,
      reason,
      contextType: "TOURNAMENT",
      contextId: tournamentId,
      ...(triggerKey && { triggerKey }),
    });
  };

  if (tournamentsPlayedAfter === 1 && !earnedAwardIds.has("first_tournament_played")) {
    add("first_tournament_played");
  }
  if (finishPlace === 1) {
    add("tournament_winner", `tournament_win_${tournamentId}`);
  }
  if (payoutCents > 0) {
    add("tournament_paid_finish", `tournament_cash_${tournamentId}`);
  }

  return candidates;
}
