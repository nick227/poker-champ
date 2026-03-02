export type TipCategory = "Preflop" | "Bankroll" | "Position" | "Mindset" | "Postflop";

export type Tip = {
  text: string;
  category?: TipCategory;
};

export const TIPS: Tip[] = [
  {
    category: "Position",
    text: "Position is power: open wider on the button.",
  },
  {
    category: "Bankroll",
    text: "Avoid risking more than 5% buy-in.",
  },
  {
    category: "Preflop",
    text: "3-bet instead more often.",
  },
  {
    category: "Postflop",
    text: "In multi-way pots, bluff less.",
  },
  {
    category: "Mindset",
    text: "When tilted, tighten up.",
  },
  {
    category: "Postflop",
    text: "In heads-up pots, bet more often.",
  },
  {
    category: "Position",
    text: "Most win rate comes from avoiding losses.",
  },
  {
    category: "Preflop",
    text: "Fold dominated offsuit hands.",
  },
  {
    category: "Mindset",
    text: "Track decisions, not short-term results.",
  },
  {
    category: "Postflop",
    text: "Count combos, not just hand labels.",
  },
];

function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDeterministicTip(seed: string): Tip {
  const index = hash32(seed) % TIPS.length;
  return TIPS[index];
}

export function getTipRotation(seed: string, count = 3): Tip[] {
  if (TIPS.length === 0) return [];
  const safeCount = Math.max(1, Math.min(count, TIPS.length));
  const start = hash32(seed) % TIPS.length;
  const picks: Tip[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    picks.push(TIPS[(start + i) % TIPS.length]);
  }
  return picks;
}
