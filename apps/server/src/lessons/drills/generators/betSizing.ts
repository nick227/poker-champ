import type { DrillQuestion } from "../types.js";

/**
 * Pots are always multiples of 12, which keeps every canonical bet percentage below (25, 33,
 * 50, 66, 75, 100) an exact whole-dollar amount — never generate-then-round into an ugly
 * number like $66.33.
 */
const POT_POOL = [60, 120, 180, 240, 300, 360] as const;
const CANONICAL_PCTS = [25, 33, 50, 66, 75, 100] as const;

function betForPct(pot: number, pct: number): number {
  return Math.round((pot * pct) / 100);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleWithIndex<T>(items: T[], correctItem: T): { shuffled: T[]; correctIndex: number } {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { shuffled, correctIndex: shuffled.indexOf(correctItem) };
}

function pickDistractorPcts(correctPct: number): number[] {
  const pool = CANONICAL_PCTS.filter((p) => p !== correctPct);
  const picked: number[] = [];
  const remaining = [...pool];
  while (picked.length < 3 && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

export function generateBetSizingQuestion(id: string): DrillQuestion {
  const pot = pickRandom(POT_POOL);
  const pct = pickRandom(CANONICAL_PCTS);
  const bet = betForPct(pot, pct);
  const askForward = Math.random() < 0.5; // forward: given %, ask $. reverse: given $, ask %.

  if (askForward) {
    const distractorPcts = pickDistractorPcts(pct);
    const values = [bet, ...distractorPcts.map((p) => betForPct(pot, p))];
    const { shuffled, correctIndex } = shuffleWithIndex(values, bet);
    return {
      id,
      category: "BET_SIZING",
      prompt: "What's the bet size?",
      contextLines: [`Pot: $${pot}`, `Bet: ${pct}%`],
      options: shuffled.map((v) => `$${v}`),
      correctIndex,
      explanation: `${pct}% of a $${pot} pot is $${bet}.`,
    };
  }

  const distractorPcts = pickDistractorPcts(pct);
  const { shuffled, correctIndex } = shuffleWithIndex([pct, ...distractorPcts], pct);
  return {
    id,
    category: "BET_SIZING",
    prompt: "What % of the pot is this bet?",
    contextLines: [`Pot: $${pot}`, `Bet: $${bet}`],
    options: shuffled.map((v) => `${v}%`),
    correctIndex,
    explanation: `$${bet} into a $${pot} pot is ${pct}% of the pot.`,
  };
}
