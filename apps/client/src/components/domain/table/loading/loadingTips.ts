export type TipCategory = "Preflop" | "Bankroll" | "Position" | "Mindset" | "Postflop";

export type Tip = {
  text: string;
  category?: TipCategory;
};

export const TIPS: Tip[] = [
  {
    category: "Position",
    text: "Position is power: open wider on the button and tighten up out of position.",
  },
  {
    category: "Bankroll",
    text: "Protect your bankroll: avoid risking more than 5% in a single cash-game buy-in.",
  },
  {
    category: "Preflop",
    text: "If a hand is strong enough to call a large raise, ask whether it should be a 3-bet instead.",
  },
  {
    category: "Postflop",
    text: "In multi-way pots, bluff less often. Someone usually has enough equity to continue.",
  },
  {
    category: "Mindset",
    text: "When tilted, tighten up for one orbit before expanding ranges again.",
  },
  {
    category: "Postflop",
    text: "In heads-up pots, small continuation bets can create similar fold equity to larger sizing.",
  },
  {
    category: "Position",
    text: "Most win rate comes from avoiding dominated spots out of position, not from heroic calls.",
  },
  {
    category: "Preflop",
    text: "Facing frequent 3-bets? Defend with suited connectors and blockers, fold dominated offsuit hands.",
  },
  {
    category: "Mindset",
    text: "Track decisions, not short-term results. Good process compounds faster than short-term luck.",
  },
  {
    category: "Postflop",
    text: "Count combos, not just hand labels. Range advantage decides many close turn and river spots.",
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
