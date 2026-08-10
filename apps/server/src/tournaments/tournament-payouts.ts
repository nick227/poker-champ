export type PayoutSlot = { place: number; percent: number };

/**
 * Field-size-aware ITM payout tiers (MTT proposal, "Hand-for-hand and ITM payout tiers"): paid
 * depth scales with entrant count, roughly the standard live/online ~12-15% cash rate, instead of
 * a fixed top-3 that made no sense once multi-table fields (up to 180) shipped. Percentages are a
 * smooth decreasing curve per tier (harmonic-style decay, front-loaded toward 1st) -- product-
 * approved shape, not a novel one. Each curve sums to 100; any rounding remainder lands on 1st
 * place via computePayoutAmountsByPlace, same as before this change.
 *
 * Tiers <=9 entrants are byte-for-byte unchanged from the original fixed table (2 -> 100;
 * 3 -> 70/30; 6-9 -> 50/30/20). 4-5 entrants now pay 2 places (70/30) instead of 3 -- the one
 * behavior change below the multi-table threshold, intentional: 3 places on a 4-5 person field
 * was already a shallow "everyone almost cashes" structure that doesn't hold up once deeper
 * fields exist to compare against.
 */
const PAYOUT_PERCENT_CURVES: { maxEntrants: number; percents: number[] }[] = [
  { maxEntrants: 2, percents: [100] },
  { maxEntrants: 5, percents: [70, 30] },
  { maxEntrants: 9, percents: [50, 30, 20] },
  { maxEntrants: 19, percents: [41.5, 25.6, 18.5, 14.4] },
  { maxEntrants: 39, percents: [34.1, 21, 15.1, 11.8, 9.7, 8.3] },
  { maxEntrants: 79, percents: [28.6, 17.6, 12.7, 9.9, 8.2, 6.9, 6, 5.3, 4.8] },
  { maxEntrants: 143, percents: [24.1, 14.9, 10.7, 8.4, 6.9, 5.9, 5.1, 4.5, 4, 3.6, 3.3, 3.1, 2.8, 2.7] },
  {
    maxEntrants: Infinity,
    percents: [22.1, 13.6, 9.8, 7.7, 6.3, 5.4, 4.7, 4.1, 3.7, 3.3, 3.1, 2.8, 2.6, 2.4, 2.3, 2.1, 2, 2],
  },
];

export function getPayoutSlots(entrantCount: number): PayoutSlot[] {
  const tier = PAYOUT_PERCENT_CURVES.find((t) => entrantCount <= t.maxEntrants)!;
  return tier.percents.map((percent, i) => ({ place: i + 1, percent }));
}

/** Returns payout cents keyed by finish place (1st, 2nd, 3rd). */
export function computePayoutAmountsByPlace(
  prizePoolCents: number,
  entrantCount: number,
): Map<number, number> {
  const slots = getPayoutSlots(entrantCount);
  const amounts = new Map<number, number>();
  let distributed = 0;

  for (const slot of slots) {
    const amount = Math.floor((prizePoolCents * slot.percent) / 100);
    amounts.set(slot.place, amount);
    distributed += amount;
  }

  const remainder = prizePoolCents - distributed;
  if (remainder > 0 && slots.length > 0) {
    const firstPlace = slots[0].place;
    amounts.set(firstPlace, (amounts.get(firstPlace) ?? 0) + remainder);
  }

  return amounts;
}

export function tournamentPayoutExternalRef(
  tournamentId: string,
  finishPlace: number,
  userId: string,
): string {
  return `tournament_payout_${tournamentId}_${finishPlace}_${userId}`;
}

/** Payout rule B: bots are ineligible; prizes roll to eligible humans by human finish order. */
export function computeHumanPayoutAmountsByUserId(
  prizePoolCents: number,
  humanEntrantCount: number,
  humanFinishers: { userId: string; finishPlace: number }[],
): Map<string, number> {
  if (humanEntrantCount < 2 || prizePoolCents <= 0) return new Map();

  const paidSlots = getPayoutSlots(humanEntrantCount).sort((a, b) => a.place - b.place);

  const sortedHumans = humanFinishers
    .slice()
    .sort((a, b) => a.finishPlace - b.finishPlace);
  const payableHumans = sortedHumans.slice(0, paidSlots.length);
  if (payableHumans.length === 0) return new Map();

  const payableSlots = paidSlots.slice(0, payableHumans.length);
  const payablePercentTotal = payableSlots.reduce((sum, slot) => sum + slot.percent, 0);
  if (payablePercentTotal <= 0) return new Map();

  const payouts = new Map<string, number>();
  let distributed = 0;
  for (let i = 0; i < payableSlots.length; i++) {
    const slot = payableSlots[i]!;
    const human = payableHumans[i]!;
    const amountCents = Math.floor((prizePoolCents * slot.percent) / payablePercentTotal);
    payouts.set(human.userId, amountCents);
    distributed += amountCents;
  }

  const remainder = prizePoolCents - distributed;
  if (remainder > 0) {
    const firstHuman = payableHumans[0]!;
    payouts.set(firstHuman.userId, (payouts.get(firstHuman.userId) ?? 0) + remainder);
  }

  return payouts;
}
