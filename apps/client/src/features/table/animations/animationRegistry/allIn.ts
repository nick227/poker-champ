import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import { defFromPreset } from "./shared";

type AllInTier = 0 | 1 | 2 | 3 | 4;

const DURATIONS_MS: Record<AllInTier, number> = {
  0: 1000,
  1: 1200,
  2: 1500,
  3: 1800,
  4: 2200,
};

const PRESET_BY_TIER: Record<AllInTier, "TIER_0" | "TIER_1" | "TIER_2" | "TIER_3" | "ALL_IN_TIER_4"> = {
  0: "TIER_0",
  1: "TIER_1",
  2: "TIER_2",
  3: "TIER_3",
  4: "ALL_IN_TIER_4",
};

function buildAllInTier(tier: AllInTier): TableAnimationDefinition {
  return defFromPreset(FX_EVENT.ALL_IN, tier, PRESET_BY_TIER[tier], DURATIONS_MS[tier]);
}

export const ALL_IN_TIERS: TableAnimationDefinition[] = [
  buildAllInTier(0),
  buildAllInTier(1),
  buildAllInTier(2),
  buildAllInTier(3),
  buildAllInTier(4),
];
