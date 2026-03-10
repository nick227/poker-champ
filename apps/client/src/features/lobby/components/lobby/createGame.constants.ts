/** Default for "Show Stats" when creating a game. Toggle here to default On (true) or Off (false). */
export const DEFAULT_SHOW_STATS = false;

/** Blinds options: [smallBlindCents, bigBlindCents] */
export const BLINDS_OPTIONS: ReadonlyArray<{ label: string; smallBlindCents: number; bigBlindCents: number }> = [
  { label: "$1 / $2", smallBlindCents: 100, bigBlindCents: 200 },
  { label: "$2 / $5", smallBlindCents: 200, bigBlindCents: 500 },
  { label: "$5 / $10", smallBlindCents: 500, bigBlindCents: 1000 },
  { label: "$100 / $200", smallBlindCents: 10000, bigBlindCents: 20000 },
];

export const MIN_BB = 20;
export const MAX_BB = 100;

/** Buy-in options as BB multiples; locked to MIN_BB and MAX_BB. */
const BUYIN_STEPS = [MIN_BB, 50, MAX_BB] as const;

export type BuyInOption = {
  label: string;
  minBuyInCents: number;
};

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

export function getMaxBuyInCents(bigBlindCents: number): number {
  return bigBlindCents * MAX_BB;
}

export function getBuyInOptions(bigBlindCents: number): ReadonlyArray<BuyInOption> {
  if (bigBlindCents <= 0) return [];
  return BUYIN_STEPS.map((bb) => {
    const cents = bigBlindCents * bb;
    return {
      label: `${formatDollars(cents)} (${bb} BB)`,
      minBuyInCents: cents,
    };
  });
}

/** Default min buy-in: 20 BB so min and max differ (max is 100 BB). */
export function getDefaultMinBuyInCents(bigBlindCents: number): number {
  return bigBlindCents * MIN_BB;
}
