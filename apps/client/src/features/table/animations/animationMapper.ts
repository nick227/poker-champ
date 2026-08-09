/** Poker context for pot win tier. Animation system does not import poker types. */
export type PotWinTierContext = {
  potCents: number;
  winningHandDescr?: string;
};

const POT_SIZE_TIERS_CENTS = [500, 2000, 10000, 50000] as const;

/** Amount (cents) above which all-in is treated as "big bet" for tier boost. */
const BIG_BET_CENTS_THRESHOLD = 5000;

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

function tierFromPotAndHand(
  potCents: number,
  winningHandDescr?: string
): 0 | 1 | 2 | 3 | 4 {
  let tier = 0;
  for (let i = 0; i < POT_SIZE_TIERS_CENTS.length; i++) {
    if (potCents >= POT_SIZE_TIERS_CENTS[i]) tier = i + 1;
  }
  const lower = (winningHandDescr ?? "").toLowerCase();
  let boost = 0;
  for (const [key, val] of Object.entries(HAND_STRENGTH_BOOST)) {
    if (lower.includes(key) && val > boost) boost = val;
  }
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
  const bigBet = ctx.amountCents >= BIG_BET_CENTS_THRESHOLD ? 1 : 0;
  return Math.min(4, potTier + bigBet) as 0 | 1 | 2 | 3 | 4;
}

/** Poker context for showdown tier. Animation system does not import poker types. */
export type ShowdownTierContext = {
  potCents: number;
  /**
   * True when hero is (one of) the winner(s) of this showdown.
   * Hand-strength boost only applies when hero actually holds the winning hand —
   * a showdown hero *loses* should not get an inflated tier from the opponent's strong hand.
   */
  isHeroWinner: boolean;
  /** Winning hand description. Only used to boost tier when isHeroWinner is true. */
  winningHandDescr?: string;
};

export function mapShowdownTier(ctx: ShowdownTierContext): 0 | 1 | 2 | 3 | 4 {
  return tierFromPotAndHand(ctx.potCents, ctx.isHeroWinner ? ctx.winningHandDescr : undefined);
}
