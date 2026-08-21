import { calcPotOdds } from "../../../engine/odds/OddsService.js";
import type { DrillQuestion } from "../types.js";

/**
 * Pot/call pairs are constructed backwards from a clean target percentage (never generated
 * then rounded), so the correct answer always lands exactly on one of the offered options.
 */
const CANONICAL_PCTS = [10, 20, 25, 33, 50] as const;

const POT_POOL_BY_DENOMINATOR: Record<number, number[]> = {
  9: [90, 180, 270, 360],
  4: [80, 120, 160, 200, 240],
  3: [60, 90, 120, 150, 180],
  2: [60, 80, 100, 120, 140],
  1: [40, 60, 80, 100, 120],
};

// call = pot / denominator, giving call/(pot+call) exactly the target pct.
const DENOMINATOR_BY_PCT: Record<number, number> = { 10: 9, 20: 4, 25: 3, 33: 2, 50: 1 };

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

export function generatePotOddsQuestion(id: string): DrillQuestion {
  const targetPct = pickRandom(CANONICAL_PCTS);
  const denominator = DENOMINATOR_BY_PCT[targetPct];
  const pot = pickRandom(POT_POOL_BY_DENOMINATOR[denominator]);
  const call = pot / denominator;

  // Sanity check against the real formula rather than trusting the derivation blindly.
  const actualPct = Math.round(calcPotOdds(pot * 100, call * 100) * 100);
  const correctPct = actualPct === targetPct ? targetPct : actualPct;

  const distractorPool = CANONICAL_PCTS.filter((p) => p !== correctPct);
  const distractors: number[] = [];
  const pool = [...distractorPool];
  while (distractors.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    distractors.push(pool.splice(idx, 1)[0]);
  }

  const optionValues = [correctPct, ...distractors];
  const { shuffled, correctIndex } = shuffleWithIndex(
    optionValues,
    correctPct,
  );

  return {
    id,
    category: "POT_ODDS",
    prompt: "What equity do you need to call profitably?",
    contextLines: [`Pot: $${pot}`, `Call: $${call}`],
    options: shuffled.map((p) => `${p}%`),
    correctIndex,
    explanation: `Call $${call} into a $${pot} pot: ${call}/(${pot}+${call}) = ${correctPct}% equity needed.`,
  };
}
