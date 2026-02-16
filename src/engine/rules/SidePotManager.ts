import type { PlayerState } from "../../state/PlayerState.js";

export type SidePot = {
  /** Inclusive commitment threshold for eligibility (level). */
  levelCents: number;
  /** Total amount in this pot. */
  amountCents: number;
  /** PlayerIds eligible to win this pot (non-folded at showdown). */
  eligiblePlayerIds: string[];
};

/**
 * Build side pots from per-player committed amounts.
 *
 * Inputs:
 * - `playersAll`: includes folded players too (they contribute money)
 * - `eligibleAtShowdown`: only players who can win (not folded/out)
 */
export function buildSidePots(playersAll: PlayerState[], eligibleAtShowdown: PlayerState[]): SidePot[] {
  const contributors = playersAll
    .filter(p => p.committedCents > 0 && p.status !== "OUT")
    .map(p => ({ id: p.id, committed: p.committedCents, folded: p.status === "FOLDED" || p.status === "ABANDONED" }))
    .sort((a, b) => a.committed - b.committed);

  if (contributors.length === 0) return [];

  const levels = Array.from(new Set(contributors.map(c => c.committed))).sort((a, b) => a - b);

  const eligibleSet = new Set(eligibleAtShowdown.map(p => p.id));

  const pots: SidePot[] = [];
  let prev = 0;

  for (const level of levels) {
    const inThisAndAbove = contributors.filter(c => c.committed >= level);
    const count = inThisAndAbove.length;
    const slice = (level - prev) * count;
    if (slice <= 0) continue;

    const eligibleIds = inThisAndAbove
      .map(c => c.id)
      .filter(id => eligibleSet.has(id));

    pots.push({
      levelCents: level,
      amountCents: slice,
      eligiblePlayerIds: eligibleIds,
    });

    prev = level;
  }

  return pots;
}

/**
 * Split a pot among winners, distributing odd chips by seat order starting left of dealer.
 */
export function splitPotCents(
  potCents: number,
  winnerIds: string[],
  seatOrderFromLeftOfDealer: string[],
): Map<string, number> {
  const payouts = new Map<string, number>();
  if (potCents <= 0 || winnerIds.length === 0) return payouts;

  const base = Math.floor(potCents / winnerIds.length);
  let remainder = potCents - base * winnerIds.length;

  for (const id of winnerIds) payouts.set(id, (payouts.get(id) ?? 0) + base);

  if (remainder > 0) {
    const winnerSet = new Set(winnerIds);
    for (const id of seatOrderFromLeftOfDealer) {
      if (remainder <= 0) break;
      if (!winnerSet.has(id)) continue;
      payouts.set(id, (payouts.get(id) ?? 0) + 1);
      remainder -= 1;
    }
  }

  return payouts;
}
