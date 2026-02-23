import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { BotActionContext } from "../../../BotBrain.js";
import type { BrainRng } from "../../../BotBrain.js";
import type { SizingRecipe, SizingWeights } from "../types.js";
import { weightedPick } from "./weightedPick.js";

const RATIO_BY_RECIPE: Record<SizingRecipe, number> = {
  OPEN_SMALL: 0.1,
  OPEN_STD: 0.4,
  OPEN_LARGE: 0.75,
  THREEBET_SMALL: 0.2,
  THREEBET_STD: 0.5,
  THREEBET_LARGE: 0.8,
  CBET_SMALL: 0.15,
  CBET_STD: 0.45,
  CBET_LARGE: 0.8,
  JAM: 1,
};

export function resolveSizingRecipe(weights: SizingWeights | undefined, rng?: BrainRng): SizingRecipe | undefined {
  if (!weights) return undefined;
  return weightedPick(weights, rng);
}

export function resolveWagerAmount(
  recipe: SizingRecipe | undefined,
  ctx: BotActionContext,
  options: HeroActionOptions,
): number | undefined {
  if (options.minRaiseTo == null || options.maxRaiseTo == null) return undefined;
  const min = Math.min(options.minRaiseTo, options.maxRaiseTo);
  const max = Math.max(options.minRaiseTo, options.maxRaiseTo);
  if (max <= min) return min;

  if (!recipe) return min;
  if (recipe === "JAM") return max;

  const ratio = RATIO_BY_RECIPE[recipe] ?? 0.5;
  const range = max - min;
  const suggested = Math.round(min + range * ratio);

  // Keep sizing inside legal bounds; resolver clamp remains final authority.
  const stackCap = Math.max(min, ctx.seatSnapshot.stackCents + ctx.seatSnapshot.roundBetCents);
  return clampToLegalBounds(suggested, min, Math.min(max, stackCap));
}

function clampToLegalBounds(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}
