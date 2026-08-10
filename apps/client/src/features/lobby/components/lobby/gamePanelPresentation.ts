/**
 * Pure presentational derivations for GameTablePanel. No new data is fetched or required -
 * everything here is computed from fields already on `LobbyTableRow` (players/seats/minBuyInCents),
 * per LOBBY_PAGE_REDESIGN_PROPOSAL.md "Status strip" and "Header band > Context tags" anatomy.
 */

export type TableStatusTone = "success" | "warn" | "muted";

export type TableStatus = {
  label: "Open" | "Active" | "Filling" | "Full";
  tone: TableStatusTone;
};

/**
 * Occupancy-based status pill — 4-state model.
 *
 * empty    (ratio = 0)      → muted   "Open"    — joinable but quiet
 * active   (0 < r < 0.5)   → success "Active"  — live game, good signal
 * filling  (0.5 ≤ r < 1.0) → success "Filling" — healthy game, desirable
 * full     (ratio ≥ 1.0)   → warn    "Full"    — unavailable, not alarming
 *
 * Full is NOT danger — a full table is a popular table, not a problem.
 * Thresholds are informational only; joinability is governed by `resolveCashLobbyJoin`.
 */
export function resolveTableStatus(players: number, seats: number): TableStatus {
  const ratio = seats > 0 ? players / seats : 0;
  if (ratio >= 1.0) return { label: "Full", tone: "warn" };
  if (ratio >= 0.5) return { label: "Filling", tone: "success" };
  if (ratio > 0) return { label: "Active", tone: "success" };
  return { label: "Open", tone: "muted" };
}

/** Occupancy bar color — same 4-state semantics as resolveTableStatus. */
export type OccupancyTone = "muted" | "success" | "brand" | "warn";

export function resolveOccupancyTone(players: number, seats: number): OccupancyTone {
  const ratio = seats > 0 ? players / seats : 0;
  if (ratio >= 1.0) return "warn";
  if (ratio >= 0.5) return "brand";
  if (ratio > 0) return "success";
  return "muted";
}

export const OCCUPANCY_BAR_CLASS: Record<OccupancyTone, string> = {
  muted: "bg-border",
  success: "bg-success",
  brand: "bg-primary",
  warn: "bg-warn",
};

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
