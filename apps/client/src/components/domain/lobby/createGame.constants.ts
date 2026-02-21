/** Blinds options: [smallBlindCents, bigBlindCents] */
export const BLINDS_OPTIONS: ReadonlyArray<{ label: string; smallBlindCents: number; bigBlindCents: number }> = [
  { label: "$0.10 / $0.20", smallBlindCents: 10, bigBlindCents: 20 },
  { label: "$0.25 / $0.50", smallBlindCents: 25, bigBlindCents: 50 },
  { label: "$0.50 / $1", smallBlindCents: 50, bigBlindCents: 100 },
  { label: "$1 / $2", smallBlindCents: 100, bigBlindCents: 200 },
  { label: "$2 / $5", smallBlindCents: 200, bigBlindCents: 500 },
  { label: "$5 / $10", smallBlindCents: 500, bigBlindCents: 1000 },
];

/** Min buy-in options (cents). Labels for display. */
export const MIN_BUYIN_OPTIONS: ReadonlyArray<{ label: string; minBuyInCents: number }> = [
  { label: "$5", minBuyInCents: 500 },
  { label: "$10", minBuyInCents: 1000 },
  { label: "$20", minBuyInCents: 2000 },
  { label: "$50", minBuyInCents: 5000 },
  { label: "$100", minBuyInCents: 10000 },
  { label: "$200", minBuyInCents: 20000 },
  { label: "$500", minBuyInCents: 50000 },
  { label: "$1,000", minBuyInCents: 100000 },
];

const BB_CAP = 100;
export const MIN_BB = 20;

export function getMaxBuyInCents(bigBlindCents: number): number {
  return bigBlindCents * BB_CAP;
}

/** Options where 20 BB <= minBuyInCents <= 100 BB (max buy-in). */
export function getValidMinBuyInOptions(bigBlindCents: number) {
  const minCents = bigBlindCents * MIN_BB;
  const maxCents = getMaxBuyInCents(bigBlindCents);
  return MIN_BUYIN_OPTIONS.filter((o) => o.minBuyInCents >= minCents && o.minBuyInCents <= maxCents);
}

/** First valid min buy-in option >= 20 BB. */
export function getDefaultMinBuyInCents(bigBlindCents: number): number {
  const valid = getValidMinBuyInOptions(bigBlindCents);
  return valid[0]?.minBuyInCents ?? bigBlindCents * MIN_BB;
}
