import type { DerivedFeatures, PostflopNodeCompiled, TightAggressiveCompiledConfig } from "../types.js";

export function resolvePostflopNode(
  postflop: TightAggressiveCompiledConfig["postflop"],
  features: DerivedFeatures,
): PostflopNodeCompiled {
  const street = features.street === "PREFLOP" ? "FLOP" : features.street;
  const handClass = features.handClass ?? "AIR";
  return postflop.table[street][features.pressureBucket][handClass];
}
