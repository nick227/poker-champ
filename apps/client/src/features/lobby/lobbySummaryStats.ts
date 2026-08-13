import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TournamentSummary } from "@/services/tournaments.types";

export function computeCashLobbyStats(tables: LobbyTableRow[]): {
  tablesLive: number;
  seatsAvailable: number;
} {
  let seatsAvailable = 0;
  for (const table of tables) {
    seatsAvailable += Math.max(0, table.seats - table.players);
  }
  return { tablesLive: tables.length, seatsAvailable };
}

export function computeTournamentLobbyStats(tournaments: TournamentSummary[]): {
  upcomingEvents: number;
  playersRegistered: number;
} {
  let upcomingEvents = 0;
  let playersRegistered = 0;
  for (const tournament of tournaments) {
    if (tournament.status === "REGISTERING") upcomingEvents += 1;
    playersRegistered += tournament.registeredCount;
  }
  return { upcomingEvents, playersRegistered };
}
