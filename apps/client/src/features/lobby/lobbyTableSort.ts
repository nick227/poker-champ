import type { LobbyTableRow } from "@/lib/lobbyTables";
import { resolveCashLobbyStatus } from "./cashLobbyRow";

export type LobbySortDir = "asc" | "desc";
export type LobbySortKey = "name" | "players" | "blinds" | "status";

export const LOBBY_SORT_INITIAL_DIR: Record<LobbySortKey, LobbySortDir> = {
  name: "asc",
  blinds: "asc",
  players: "desc",
  status: "asc",
};

function cashStatusRank(table: LobbyTableRow): number {
  const status = resolveCashLobbyStatus(table, false);
  if (status === "live") return 0;
  if (status === "open") return 1;
  return 2;
}

const LOBBY_SORT_COMPARATORS: Record<
  LobbySortKey,
  (a: LobbyTableRow, b: LobbyTableRow) => number
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  blinds: (a, b) => a.bigBlindCents - b.bigBlindCents,
  players: (a, b) => {
    const seated = a.players - b.players;
    if (seated !== 0) return seated;
    return (a.connectedHumanCount ?? 0) - (b.connectedHumanCount ?? 0);
  },
  status: (a, b) => cashStatusRank(a) - cashStatusRank(b),
};

export function lobbySortCaret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

export function sortLobbyTables(
  tables: LobbyTableRow[],
  key: LobbySortKey,
  dir: LobbySortDir,
): LobbyTableRow[] {
  const cmp = LOBBY_SORT_COMPARATORS[key];
  const sorted = [...tables].sort((a, b) => {
    const d = cmp(a, b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
  return dir === "asc" ? sorted : sorted.reverse();
}
