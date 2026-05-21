import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export function isTournamentEliminatedSpectator(snapshot: TableSnapshotPayload): boolean {
  return Boolean(snapshot.table?.tournament && snapshot.hero.tournamentViewer?.isEliminated);
}
