/** Blinds options: [smallBlindCents, bigBlindCents] */
export const BLINDS_OPTIONS: ReadonlyArray<{ label: string; smallBlindCents: number; bigBlindCents: number }> = [
  { label: "$1 / $2", smallBlindCents: 100, bigBlindCents: 200 },
  { label: "$2 / $5", smallBlindCents: 200, bigBlindCents: 500 },
  { label: "$5 / $10", smallBlindCents: 500, bigBlindCents: 1000 },
  { label: "$100 / $200", smallBlindCents: 10000, bigBlindCents: 20000 },
];

export const MIN_BB = 20;
export const MAX_BB = 100;

/** Buy-in options as BB multiples (20, 50, 100). */
const BUYIN_STEPS = [20, 50, 100] as const;

export type BuyInOption = {
  label: string;
  minBuyInCents: number;
};

export function getMaxBuyInCents(bigBlindCents: number): number {
  return bigBlindCents * MAX_BB;
}

export function getBuyInOptions(bigBlindCents: number): ReadonlyArray<BuyInOption> {
  if (bigBlindCents <= 0) return [];
  const options: BuyInOption[] = [];
  for (const bb of BUYIN_STEPS) {
    const cents = bigBlindCents * bb;
    options.push({
      label: `$${(cents / 100).toLocaleString()} (${bb} BB)`,
      minBuyInCents: cents,
    });
  }
  return options;
}

/** Default min buy-in: 100 BB (standard poker-site default). */
export function getDefaultMinBuyInCents(bigBlindCents: number): number {
  return bigBlindCents * MAX_BB;
}
