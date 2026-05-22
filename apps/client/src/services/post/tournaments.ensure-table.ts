import { request } from "@poker-champ/sdk";
import type { TournamentSummary } from "@/services/tournaments.types";
import { withApiError } from "@/services/_helpers/withApiError";

export type TournamentEnsureTableResult = {
  tableId: string;
  roomId: string;
  tournament: TournamentSummary;
};

export async function postTournamentEnsureTable(
  tournamentId: string,
): Promise<TournamentEnsureTableResult> {
  const res = await withApiError(() =>
    request<TournamentEnsureTableResult>("POST", `/api/tournaments/${tournamentId}/ensure-table`),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
