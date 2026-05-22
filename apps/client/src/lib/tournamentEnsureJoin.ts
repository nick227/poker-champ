import { mapTournamentApiError } from "@/lib/tournament.utils";
import { postTournamentEnsureTable } from "@/services/post/tournaments.ensure-table";
import type { TournamentSummary } from "@/services/tournaments.types";

const BLOCKED_TOURNAMENT_STATUSES = new Set(["FINISHED", "CANCELLED", "ABANDONED"]);

export type TournamentEnsureJoinOk = {
  ok: true;
  tournament: TournamentSummary;
  tableId: string;
  roomId: string;
  buyInCents: number;
};

export type TournamentEnsureJoinBlocked = {
  ok: false;
  message: string;
};

export type TournamentEnsureJoinResult = TournamentEnsureJoinOk | TournamentEnsureJoinBlocked;

function isNavigateReady(tournament: TournamentSummary): boolean {
  return Boolean(tournament.tableId && tournament.roomId);
}

export function isTournamentTableJoinBlocked(status: string): boolean {
  return BLOCKED_TOURNAMENT_STATUSES.has(status);
}

/** Always resolve a live table via ensure-table; cached ids are hints only. */
export async function resolveTournamentTableForJoin(
  tournamentId: string,
): Promise<TournamentEnsureJoinResult> {
  try {
    const ensured = await postTournamentEnsureTable(tournamentId);
    const tournament = ensured.tournament;
    if (isTournamentTableJoinBlocked(tournament.status)) {
      const endedCopy =
        tournament.status === "FINISHED"
          ? "This tournament has ended."
          : tournament.status === "CANCELLED"
            ? "This tournament was cancelled."
            : "This tournament is no longer available.";
      return { ok: false, message: endedCopy };
    }
    const tableId = ensured.tableId || tournament.tableId;
    const roomId = ensured.roomId || tournament.roomId;
    if (!tableId || !roomId) {
      return {
        ok: false,
        message: mapTournamentApiError("TOURNAMENT_TABLE_UNAVAILABLE"),
      };
    }
    if (!isNavigateReady({ ...tournament, tableId, roomId })) {
      return {
        ok: false,
        message: mapTournamentApiError("TOURNAMENT_TABLE_UNAVAILABLE"),
      };
    }
    return {
      ok: true,
      tournament: { ...tournament, tableId, roomId },
      tableId,
      roomId,
      buyInCents: tournament.startingStackCents,
    };
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Could not open tournament table";
    return { ok: false, message: mapTournamentApiError(raw) };
  }
}
