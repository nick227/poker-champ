import { tournaments } from "@poker-champ/sdk";
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
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
