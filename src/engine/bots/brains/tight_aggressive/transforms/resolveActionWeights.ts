import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { ActionPayload } from "../../../../../messages/schemas.js";
import { getLegalActions } from "../../../utils/decision.js";
import type { DerivedFeatures, PostflopNodeCompiled, PreflopNodeCompiled } from "../types.js";

type WeightMap = Partial<Record<ActionPayload["action"], number>>;

export function resolveActionWeights(
  node: PreflopNodeCompiled | PostflopNodeCompiled,
  features: DerivedFeatures,
  options: HeroActionOptions,
): WeightMap {
  const legalActions = new Set(getLegalActions(options).map((entry) => entry.action));

  if (features.street === "PREFLOP" && "comboWeights169" in node) {
    const comboIndex = features.comboIndex ?? 0;
    const comboWeight = node.comboWeights169[comboIndex] ?? 0;
    if (comboWeight === 0) {
      const gateWeights: WeightMap = {};
      if (legalActions.has("CHECK")) gateWeights.CHECK = 1;
      if (legalActions.has("FOLD")) gateWeights.FOLD = 1;
      return gateWeights;
    }
  }

  const weights: WeightMap = {};
  for (const action of legalActions) {
    const value = node.actionWeights[action];
    if (value != null && value > 0) {
      weights[action] = value;
    }
  }

  if (Object.keys(weights).length > 0) {
    return weights;
  }

  const fallback: WeightMap = {};
  if (legalActions.has("CHECK")) fallback.CHECK = 1;
  else if (legalActions.has("FOLD")) fallback.FOLD = 1;
  else if (legalActions.has("CALL")) fallback.CALL = 1;
  else if (legalActions.has("ALL_IN")) fallback.ALL_IN = 1;
  return fallback;
}
