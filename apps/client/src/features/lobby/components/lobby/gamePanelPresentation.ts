/**
 * Pure presentational derivations for GameTablePanel. No new data is fetched or required -
 * everything here is computed from fields already on `LobbyTableRow` (players/seats/minBuyInCents),
 * per LOBBY_PAGE_REDESIGN_PROPOSAL.md "Status strip" and "Header band > Context tags" anatomy.
 */

export type TableStatusTone = "success" | "warn" | "danger";

export type TableStatus = {
  label: "Open" | "Filling" | "Almost Full";
  tone: TableStatusTone;
};

/**
 * Occupancy-based status pill. Thresholds are informational only (do not gate joinability -
 * that stays governed by `resolveCashLobbyJoin`), matching the proposal's requirement that
 * status must never be the sole/blocking signal.
 */
export function resolveTableStatus(players: number, seats: number): TableStatus {
  const ratio = seats > 0 ? players / seats : 0;
  if (ratio >= 0.75) return { label: "Almost Full", tone: "danger" };
  if (ratio >= 0.34) return { label: "Filling", tone: "warn" };
  return { label: "Open", tone: "success" };
}

export type StakesTier = "low" | "mid" | "high";

/** Maps min buy-in to one of the existing chip-low/chip-mid/chip-high tokens for a stakes accent. */
export function resolveStakesTier(minBuyInCents: number): StakesTier {
  if (minBuyInCents < 5000) return "low";
  if (minBuyInCents <= 50000) return "mid";
  return "high";
}

export const STAKES_TIER_BG_CLASS: Record<StakesTier, string> = {
  low: "bg-chip-low",
  mid: "bg-chip-mid",
  high: "bg-chip-high",
};

export function formatSeatsTag(seats: number): string {
  return `${seats}-Max`;
}
