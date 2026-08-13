import {
  filterTournamentsForBrowseLobby,
  selectJoinedTournaments,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

export function buildLobbyTournamentRows(
  tournaments: TournamentSummary[],
  authenticated: boolean,
): { pinned: TournamentSummary[]; browse: TournamentSummary[] } {
  const pinned = authenticated ? selectJoinedTournaments(tournaments) : [];
  return { pinned, browse: filterTournamentsForBrowseLobby(tournaments) };
}
