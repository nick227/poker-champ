import type { DrillQuestion } from "../types.js";

const OUTS_POOL = [2, 3, 4, 6, 8, 9, 12, 15] as const;

function shuffleWithIndex<T>(items: T[], correctItem: T): { shuffled: T[]; correctIndex: number } {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { shuffled, correctIndex: shuffled.indexOf(correctItem) };
}

export function generateRuleOf2And4Question(id: string): DrillQuestion {
  const outs = OUTS_POOL[Math.floor(Math.random() * OUTS_POOL.length)];
  const cardsToCome = Math.random() < 0.5 ? 1 : 2;
  const multiplier = cardsToCome === 1 ? 2 : 4;
  const correctPct = outs * multiplier;

  // Distractors: the "wrong rule" (other multiplier) plus nearby outs counts at the right multiplier.
  const wrongMultiplierPct = outs * (multiplier === 2 ? 4 : 2);
  const candidateValues = new Set<number>([
    wrongMultiplierPct,
    (outs + 2) * multiplier,
    Math.max(0, outs - 2) * multiplier,
    (outs + 1) * multiplier,
  ]);
  candidateValues.delete(correctPct);

  const distractors: number[] = [];
  for (const v of candidateValues) {
    if (distractors.length >= 3) break;
    if (v !== correctPct && !distractors.includes(v)) distractors.push(v);
  }
  // Extremely unlikely fallback if dedup left us short.
  let filler = correctPct + multiplier;
  while (distractors.length < 3) {
    if (filler !== correctPct && !distractors.includes(filler)) distractors.push(filler);
    filler += multiplier;
  }

  const { shuffled, correctIndex } = shuffleWithIndex([correctPct, ...distractors], correctPct);

  return {
    id,
    category: "RULE_OF_2_4",
    prompt: `${outs} outs`,
    contextLines: [cardsToCome === 1 ? "One card to come" : "Two cards to come"],
    options: shuffled.map((v) => `${v}%`),
    correctIndex,
    explanation:
      cardsToCome === 1
        ? `One card to come: ${outs} outs × 2 ≈ ${correctPct}%.`
        : `Two cards to come: ${outs} outs × 4 ≈ ${correctPct}%.`,
  };
}
