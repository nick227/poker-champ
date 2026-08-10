import type { LobbyTableRow } from "@/lib/lobbyTables";

export type LobbySortKey = "name" | "players" | "blinds" | "buyIn" | "status";

export const LOBBY_SORT_COMPARATORS: Record<
  LobbySortKey,
  (a: LobbyTableRow, b: LobbyTableRow) => number
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  players: (a, b) => b.players - a.players,
  blinds: (a, b) => a.bigBlindCents - b.bigBlindCents,
  buyIn: (a, b) => a.minBuyInCents - b.minBuyInCents,
  status: (a, b) => (b.connectedHumanCount ?? 0) - (a.connectedHumanCount ?? 0),
};

export const LOBBY_SORT_CYCLE: Record<LobbySortKey, LobbySortKey> = {
  name: "players",
  players: "blinds",
  blinds: "buyIn",
  buyIn: "status",
  status: "name",
};

/** Human-readable display names for sort keys shown in the UI. */
export const LOBBY_SORT_LABELS: Record<LobbySortKey, string> = {
  name: "Table Name",
  players: "Players",
  blinds: "Stakes",
  buyIn: "Buy-in",
  status: "Activity",
};
