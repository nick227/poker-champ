import type { LobbyTableRow } from "@/lib/lobbyTables";

export type LobbySortKey = "name" | "players" | "blinds" | "avgPot" | "status";

export const LOBBY_SORT_COMPARATORS: Record<
  LobbySortKey,
  (a: LobbyTableRow, b: LobbyTableRow) => number
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  players: (a, b) => b.players - a.players,
  blinds: (a, b) => a.bigBlindCents - b.bigBlindCents,
  avgPot: (a, b) => (b.avgPotCents ?? -1) - (a.avgPotCents ?? -1),
  status: (a, b) => (b.connectedHumanCount ?? 0) - (a.connectedHumanCount ?? 0),
};

export const LOBBY_SORT_CYCLE: Record<LobbySortKey, LobbySortKey> = {
  name: "players",
  players: "blinds",
  blinds: "avgPot",
  avgPot: "status",
  status: "name",
};

export const LOBBY_SORT_LABELS: Record<LobbySortKey, string> = {
  name: "Table Name",
  players: "Players",
  blinds: "Stakes",
  avgPot: "Avg Pot",
  status: "Activity",
};
