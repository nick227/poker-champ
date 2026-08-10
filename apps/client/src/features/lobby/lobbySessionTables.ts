import type { LobbyTableRow } from "@/lib/lobbyTables";

type SessionMeta = {
  openTableIds: string[];
  lobbyTables: LobbyTableRow[];
  /** Open seats that belong to a tournament table — keep them out of cash pins. */
  tournamentTableIds: ReadonlySet<string>;
  tableNameByTableId: Record<string, string>;
  lastBuyInCentsByTableId: Record<string, number>;
  roomIdByTableId: Record<string, string>;
};

/** Pinned cash session rows: match lobby rows when possible, else synthesize from session meta. */
export function buildPinnedCashLobbyRows({
  openTableIds,
  lobbyTables,
  tournamentTableIds,
  tableNameByTableId,
  lastBuyInCentsByTableId,
  roomIdByTableId,
}: SessionMeta): LobbyTableRow[] {
  const byId = new Map(lobbyTables.map((row) => [row.id, row]));
  const pinned: LobbyTableRow[] = [];

  for (const id of openTableIds) {
    if (tournamentTableIds.has(id)) continue;
    const existing = byId.get(id);
    if (existing) {
      pinned.push(existing);
      continue;
    }
    const buyIn = lastBuyInCentsByTableId[id] ?? 0;
    pinned.push({
      id,
      tableId: id,
      roomId: roomIdByTableId[id] ?? "",
      name: tableNameByTableId[id] ?? id.slice(0, 8),
      smallBlindCents: 0,
      bigBlindCents: 0,
      players: 0,
      seats: 0,
      minBuyInCents: buyIn,
      maxBuyInCents: buyIn,
      creatorName: "You",
      creatorAvatarUrl: null,
      updatedAt: new Date().toISOString(),
      connectedHumanCount: 1,
    });
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
