import { tournaments } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";

export async function postTournamentRegister(tournamentId: string): Promise<void> {
  const res = await withApiError(() => tournaments.register({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
}

export async function postTournamentUnregister(tournamentId: string): Promise<void> {
  const res = await withApiError(() => tournaments.unregister({ id: tournamentId }));
  if (!res.ok) throw new Error(res.error.message);
}
