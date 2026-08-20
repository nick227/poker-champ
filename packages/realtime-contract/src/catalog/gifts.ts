export interface GiftCatalogEntry {
  id: string;
  emoji: string;
  label: string;
  flavorText: string;
  costCents: number;
}

export const GIFT_CATALOG: GiftCatalogEntry[] = [
  {
    id: "gift.slow_clap",
    emoji: "👏",
    label: "Slow Clap",
    flavorText: "Nice hand... barely.",
    costCents: 50,
  },
  {
    id: "gift.rose",
    emoji: "🌹",
    label: "Rose",
    flavorText: "A classy nod of respect.",
    costCents: 100,
  },
  {
    id: "gift.good_luck_charm",
    emoji: "🍀",
    label: "Good Luck Charm",
    flavorText: "Sending luck for the next hand.",
    costCents: 100,
  },
  {
    id: "gift.hat_tip",
    emoji: "🎩",
    label: "Hat Tip",
    flavorText: "Respect for a great fold or read.",
    costCents: 150,
  },
  {
    id: "gift.nice_bluff",
    emoji: "🔥",
    label: "Nice Bluff",
    flavorText: "Caught red-handed, paid in style.",
    costCents: 200,
  },
  {
    id: "gift.round_on_me",
    emoji: "🍺",
    label: "Round on Me",
    flavorText: "Buys the table a round.",
    costCents: 250,
  },
  {
    id: "gift.ice_in_your_veins",
    emoji: "🧊",
    label: "Ice in Your Veins",
    flavorText: "For a cold-blooded, clutch call.",
    costCents: 300,
  },
  {
    id: "gift.happy_cake_day",
    emoji: "🎂",
    label: "Happy Cake Day",
    flavorText: "Reserved for account-anniversary moments.",
    costCents: 300,
  },
  {
    id: "gift.sharp_play",
    emoji: "🦈",
    label: "Sharp Play",
    flavorText: "Respect for a well-timed, sharp move.",
    costCents: 350,
  },
  {
    id: "gift.gg_well_played",
    emoji: "🏆",
    label: "GG Well Played",
    flavorText: "End-of-session sportsmanship.",
    costCents: 400,
  },
  {
    id: "gift.bad_beat_sympathy",
    emoji: "🚑",
    label: "Bad Beat Sympathy",
    flavorText: "Condolences after a brutal beat.",
    costCents: 500,
  },
  {
    id: "gift.mystery_gift",
    emoji: "🎁",
    label: "Mystery Gift",
    flavorText: "Fixed cost, randomized flavor and animation only.",
    costCents: 777,
  },
  {
    id: "gift.chip_leader_crown",
    emoji: "👑",
    label: "Chip Leader Crown",
    flavorText: "Congratulating the table's current chip leader.",
    costCents: 1000,
  },
  {
    id: "gift.high_roller_salute",
    emoji: "💎",
    label: "High Roller Salute",
    flavorText: "A grand gesture for a big pot won.",
    costCents: 2500,
  },
];

export const GIFT_CATALOG_BY_KEY: ReadonlyMap<string, GiftCatalogEntry> = new Map(
  GIFT_CATALOG.map((entry) => [entry.id, entry]),
);
