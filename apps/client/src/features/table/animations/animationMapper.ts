/** Poker context for pot win tier. Animation system does not import poker types. */
export type PotWinTierContext = {
  potCents: number;
  winningHandDescr?: string;
};

const POT_SIZE_TIERS_CENTS = [500, 2000, 10000, 50000] as const;
const HAND_STRENGTH_BOOST: Record<string, number> = {
  "high card": 0,
  "pair": 1,
  "two pair": 1,
  "three of a kind": 2,
  straight: 2,
  flush: 3,
  "full house": 3,
  "four of a kind": 4,
  "straight flush": 4,
  "royal flush": 4,
};

function tierFromPotAndHand(potCents: number, winningHandDescr?: string): number {
  let tier = 0;
  for (let i = 0; i < POT_SIZE_TIERS_CENTS.length; i++) {
    if (potCents >= POT_SIZE_TIERS_CENTS[i]) tier = i + 1;
  }
  const lower = (winningHandDescr ?? "").toLowerCase();
  const boost = Object.entries(HAND_STRENGTH_BOOST).reduce(
    (acc, [key, val]) => (lower.includes(key) ? Math.max(acc, val) : acc),
    0
  );
  return Math.min(4, tier + boost) as 0 | 1 | 2 | 3 | 4;
}

export function mapPotWinTier(ctx: PotWinTierContext): 0 | 1 | 2 | 3 | 4 {
  return tierFromPotAndHand(ctx.potCents, ctx.winningHandDescr);
}

export type AllInTierContext = {
  potCents: number;
  amountCents: number;
};

export function mapAllInTier(ctx: AllInTierContext): 0 | 1 | 2 | 3 | 4 {
  const potTier = tierFromPotAndHand(ctx.potCents);
  const bigBet = ctx.amountCents >= 5000 ? 1 : 0;
  return Math.min(4, potTier + bigBet) as 0 | 1 | 2 | 3 | 4;
}
