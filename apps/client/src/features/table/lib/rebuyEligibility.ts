import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export const REBUY_TO_CONTINUE_COPY = "Rebuy to get back in";

const BUSTED_REBUY_STATUSES = new Set(["WAITING", "OUT", "ABANDONED", "ALL_IN"]);

/** Cash-table / shared seat check: seated hero at 0 chips in a busted status. */
export function isHeroBustedAtTable(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated) return false;
  const heroSeat =
    snapshot.hero.seat != null
      ? snapshot.seats.find((s) => s.seat === snapshot.hero.seat)
      : undefined;
  if (!heroSeat) return false;
  if (heroSeat.stackCents !== 0) return false;
  return BUSTED_REBUY_STATUSES.has(heroSeat.status);
}

/**
 * Whether the hero can open the rebuy sheet for this snapshot.
 * Tournaments use rebuyPending; cash tables use busted-at-zero seat state.
 */
export function canHeroRebuy(snapshot: TableSnapshotPayload | undefined): boolean {
  if (!snapshot) return false;

  const tournamentViewer = snapshot.hero.tournamentViewer;
  if (snapshot.table?.tournament) {
    return tournamentViewer?.rebuyPending === true;
  }

  if (tournamentViewer?.isEliminated) return false;
  if (!isHeroBustedAtTable(snapshot)) return false;

  const { minBuyInCents, maxBuyInCents } = snapshot.table;
  if (!Number.isInteger(minBuyInCents) || minBuyInCents <= 0) return false;
  if (!Number.isInteger(maxBuyInCents) || maxBuyInCents <= 0) return false;

  return true;
}
