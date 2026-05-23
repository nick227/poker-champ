import { ApiError, tournaments } from "@poker-champ/sdk";
import type { components } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";

export type GeneratedTournamentEnsureTableResult = components["schemas"]["TournamentEnsureTableResult"];
export type TournamentEnsureTableResult = Partial<GeneratedTournamentEnsureTableResult> & {
  tournament: components["schemas"]["TournamentSummary"];
};
export type TournamentEnsureJoinStatus = GeneratedTournamentEnsureTableResult["joinStatus"];

export async function postTournamentEnsureTable(
  tournamentId: string,
): Promise<TournamentEnsureTableResult> {
  const res = await withApiError(() => tournaments.ensureTable({ id: tournamentId }));
  if (!res.ok) {
    throw new ApiError(res.error.message, {
      status: res.error.status ?? 0,
      code: res.error.code,
      details: res.error.details,
    });
  }
  return res.data;
}
