export type PayoutSlot = { place: number; percent: number };

export function getPayoutSlots(entrantCount: number): PayoutSlot[] {
  if (entrantCount <= 2) {
    return [{ place: 1, percent: 100 }];
  }
  if (entrantCount === 3) {
    return [
      { place: 1, percent: 70 },
      { place: 2, percent: 30 },
    ];
  }
  return [
    { place: 1, percent: 50 },
    { place: 2, percent: 30 },
    { place: 3, percent: 20 },
  ];
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
  if (humanEntrantCount <= 0 || prizePoolCents <= 0) return new Map();

  const amountsByPlace = computePayoutAmountsByPlace(prizePoolCents, humanEntrantCount);
  const paidPlaces = [...amountsByPlace.entries()]
    .filter(([, cents]) => cents > 0)
    .sort(([a], [b]) => a - b);

  const sortedHumans = humanFinishers
    .slice()
    .sort((a, b) => a.finishPlace - b.finishPlace);

  const payouts = new Map<string, number>();
  for (let i = 0; i < paidPlaces.length && i < sortedHumans.length; i++) {
    const [, amountCents] = paidPlaces[i]!;
    const human = sortedHumans[i]!;
    payouts.set(human.userId, amountCents);
  }

  return payouts;
}
