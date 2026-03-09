import type { DerivedFeatures, PreflopNodeCompiled, TightAggressiveCompiledConfig } from "../types.js";

export function resolvePreflopNode(
  preflop: TightAggressiveCompiledConfig["preflop"],
  features: DerivedFeatures,
): PreflopNodeCompiled {
  const posNode = preflop.table[features.positionBucket];
  if (features.pressureBucket === "UNOPENED") {
    return posNode.UNOPENED;
  }
  return posNode[features.pressureBucket][features.betSizeBucket === "NONE" ? "SMALL" : features.betSizeBucket];
}
