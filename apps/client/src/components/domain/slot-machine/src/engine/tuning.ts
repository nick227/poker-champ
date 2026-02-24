import { evaluate } from "./evaluate";
import type { PayoutTier, SlotGame, SymbolKey } from "../games/types";

export type SlotTuningProfile = {
  totalOutcomes: number;
  hitRate: number;
  rtpUnitsPerBet: number;
  probabilityByOutcomeKey: Record<string, number>;
  expectedUnitsByOutcomeKey: Record<string, number>;
};

export const DEFAULT_PAYOUT_TIERS: readonly PayoutTier[] = [
  { id: "COMMON", label: "Common", minProb: 0.01 },
  { id: "UNCOMMON", label: "Uncommon", minProb: 0.005 },
  { id: "RARE", label: "Rare", minProb: 0.0015 },
  { id: "JACKPOT", label: "Jackpot", minProb: 0 },
] as const;

function countSymbols(strip: SymbolKey[]): Record<SymbolKey, number> {
  return strip.reduce(
    (acc, sym) => {
      acc[sym] = (acc[sym] ?? 0) + 1;
      return acc;
    },
    {} as Record<SymbolKey, number>,
  );
}

export function buildSlotTuningProfile(game: SlotGame): SlotTuningProfile {
  const reelCounts = game.reels.map((strip) => countSymbols(strip)) as [Record<SymbolKey, number>, Record<SymbolKey, number>, Record<SymbolKey, number>];
  const totalOutcomes = game.reels[0].length * game.reels[1].length * game.reels[2].length;

  const weightedWaysByOutcomeKey: Record<string, number> = {};
  const weightedExpectedByOutcomeKey: Record<string, number> = {};

  for (const a of game.symbols) {
    for (const b of game.symbols) {
      for (const c of game.symbols) {
        const weightedWays = (reelCounts[0][a] ?? 0) * (reelCounts[1][b] ?? 0) * (reelCounts[2][c] ?? 0);
        if (weightedWays <= 0) continue;
        const evaluated = evaluate(game, [a, b, c]);
        weightedWaysByOutcomeKey[evaluated.key] = (weightedWaysByOutcomeKey[evaluated.key] ?? 0) + weightedWays;
        weightedExpectedByOutcomeKey[evaluated.key] = (weightedExpectedByOutcomeKey[evaluated.key] ?? 0) + weightedWays * evaluated.winUnits;
      }
    }
  }

  if (totalOutcomes <= 0) {
    return {
      totalOutcomes: 0,
      hitRate: 0,
      rtpUnitsPerBet: 0,
      probabilityByOutcomeKey: {},
      expectedUnitsByOutcomeKey: {},
    };
  }

  const probabilityByOutcomeKey = Object.fromEntries(
    Object.entries(weightedWaysByOutcomeKey).map(([k, ways]) => [k, ways / totalOutcomes]),
  );
  const expectedUnitsByOutcomeKey = Object.fromEntries(
    Object.entries(weightedExpectedByOutcomeKey).map(([k, expected]) => [k, expected / totalOutcomes]),
  );

  const hitRate = Object.entries(probabilityByOutcomeKey)
    .filter(([k]) => k !== "NONE")
    .reduce((acc, [, p]) => acc + p, 0);

  const rtpUnitsPerBet = Object.values(expectedUnitsByOutcomeKey).reduce((acc, units) => acc + units, 0);

  return {
    totalOutcomes,
    hitRate,
    rtpUnitsPerBet,
    probabilityByOutcomeKey,
    expectedUnitsByOutcomeKey,
  };
}

export function tierForProbability(
  probability: number,
  isJackpot: boolean,
  tiers: readonly PayoutTier[],
): PayoutTier {
  if (tiers.length === 0) {
    return { id: "DEFAULT", label: "Win", minProb: 0 };
  }
  if (isJackpot) return tiers[tiers.length - 1];
  for (const tier of tiers) {
    if (probability >= tier.minProb) return tier;
  }
  return tiers[tiers.length - 1];
}
