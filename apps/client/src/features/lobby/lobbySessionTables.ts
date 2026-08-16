import type { LobbyTableRow } from "@/lib/lobbyTables";

type SessionMeta = {
  openTableIds: string[];
  lobbyTables: LobbyTableRow[];
  /** Open seats that belong to a tournament table — keep them out of cash pins. */
  tournamentTableIds: ReadonlySet<string>;
};

/** Local pins only order live rows; server membership is authoritative. */
export function buildPinnedCashLobbyRows({
  openTableIds,
  lobbyTables,
  tournamentTableIds,
}: SessionMeta): LobbyTableRow[] {
  const byId = new Map(lobbyTables.map((row) => [row.id, row]));
  const pinned: LobbyTableRow[] = [];

  for (const id of openTableIds) {
    if (tournamentTableIds.has(id)) continue;
    const existing = byId.get(id);
    if (existing?.status !== "ENDED" && existing?.viewer?.canResume) {
      pinned.push(existing);
    }
  }

  return pinned;
}

export function excludePinnedLobbyTables(
  tables: LobbyTableRow[],
  pinnedIds: ReadonlySet<string>,
): LobbyTableRow[] {
  if (pinnedIds.size === 0) return tables;
  return tables.filter((row) => !pinnedIds.has(row.id));
}
