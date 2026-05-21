import { tournaments } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";
import type { TournamentStandingRow, TournamentSummary } from "@/services/tournaments.types";

export async function getTournaments(status?: string): Promise<TournamentSummary[]> {
  const res = await withApiError(() => tournaments.list(status ? { status } : undefined));
  if (!res.ok) throw new Error(res.error.message);
  return res.data.tournaments ?? [];
}

export async function getTournament(id: string): Promise<TournamentSummary> {
  const res = await withApiError(() => tournaments.get({ id }));
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function getTournamentStandings(tournamentId: string): Promise<TournamentStandingRow[]> {
  const res = await withApiError(() => tournaments.standings({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
  return (res.data.standings ?? []) as TournamentStandingRow[];
}
