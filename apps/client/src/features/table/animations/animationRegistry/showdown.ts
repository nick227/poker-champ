import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import { defFromPreset } from "./shared";

type ShowdownTier = 0 | 1 | 2 | 3 | 4;

const DURATIONS_MS: Record<ShowdownTier, number> = {
  0: 1000,
  1: 1200,
  2: 1500,
  3: 1800,
  4: 2200,
};

export function buildShowdownTier(tier: ShowdownTier): TableAnimationDefinition {
  const presetName = `TIER_${tier}` as "TIER_0" | "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";
  return defFromPreset(FX_EVENT.SHOWDOWN, tier, presetName, DURATIONS_MS[tier]);
}

export const SHOWDOWN_TIERS: TableAnimationDefinition[] = [
  buildShowdownTier(0),
  buildShowdownTier(1),
  buildShowdownTier(2),
  buildShowdownTier(3),
  buildShowdownTier(4),
];
