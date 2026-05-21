import { tournaments } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";
import type { TournamentSummary } from "@/services/tournaments.types";

export type CreateTournamentInput = {
  name: string;
  entryFeeCents: number;
  startTime: string;
  maxPlayers: number;
  startingStackCents?: number;
  blindStructureId?: "standard_8min";
  lateRegMinutes?: number;
};

export async function postTournamentCreate(input: CreateTournamentInput): Promise<TournamentSummary> {
  const res = await withApiError(() => tournaments.create(input));
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function postTournamentCancel(tournamentId: string): Promise<{ refundedCount: number }> {
  const res = await withApiError(() => tournaments.cancel({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
  return { refundedCount: res.data.refundedCount ?? 0 };
}

export async function postTournamentRegister(tournamentId: string): Promise<void> {
  const res = await withApiError(() => tournaments.register({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
}

export async function postTournamentUnregister(tournamentId: string): Promise<void> {
  const res = await withApiError(() => tournaments.unregister({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
}
