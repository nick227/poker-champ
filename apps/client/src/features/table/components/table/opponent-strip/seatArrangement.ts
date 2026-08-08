/**
 * Pure seat-arrangement logic: splits an already-circularly-ordered list of opponents
 * (see table.adapter.ts — sorted by seat offset from hero, ascending, wrapping around the
 * table) into three groups that read as "around an oval table" when rendered by OpponentStrip:
 *
 *  - `top`: 0 or 1 opponent(s) directly across from the hero (top-center of the felt).
 *  - `left` / `right`: opponents flanking the felt, ordered top-to-bottom (index 0 is nearest
 *    the top-center seat, the last index is nearest the hero).
 *
 * This is a deliberately simple approximation (no real ellipse trigonometry) so it stays robust
 * across seat counts (heads-up up to 9-max) and viewport sizes rather than fragile geometry that
 * only looks right for one table size. The input order is assumed to already go all the way
 * around the table starting immediately after the hero's seat, which is exactly what
 * `table.adapter.ts` already produces — this module doesn't re-derive or care about real seat
 * numbers, just the array order.
 */

export type SeatArrangement<T> = {
  /** 0 or 1 items: the seat(s) directly across from the hero. */
  top: T[];
  /** Top-to-bottom (nearest top-center first, nearest hero last). Same length as `right`. */
  left: T[];
  /** Top-to-bottom (nearest top-center first, nearest hero last). Same length as `left`. */
  right: T[];
};

/**
 * Splits `items` (already ordered circularly starting adjacent to the hero) into a top-center
 * seat (when the count is odd) plus two evenly-sized flanking columns.
 *
 * - 0 items -> all groups empty.
 * - 1 item -> top-center only.
 * - Odd counts -> 1 top-center seat + an even split of the rest across left/right.
 * - Even counts -> no top-center seat; split evenly across left/right.
 */
export function arrangeSeatsAroundTable<T>(items: readonly T[]): SeatArrangement<T> {
  const n = items.length;
  if (n === 0) return { top: [], left: [], right: [] };

  const hasTop = n % 2 === 1;
  const topCount = hasTop ? 1 : 0;
  const perSide = (n - topCount) / 2;

  const left = items.slice(0, perSide).slice().reverse();
  const top = hasTop ? [items[perSide]] : [];
  const right = items.slice(perSide + topCount);

  return { top, left, right };
}

/**
 * Index (within `left`/`right`) of the seat pair nearest the hero — the last one, since both
 * columns are ordered top-to-bottom. Returns null when there are no side seats at all.
 */
export function nearestSeatPairIndex<T>(arrangement: SeatArrangement<T>): number | null {
  const perSide = arrangement.left.length;
  return perSide > 0 ? perSide - 1 : null;
}
