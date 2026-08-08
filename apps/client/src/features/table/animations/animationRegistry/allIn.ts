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

const PRESET_BY_TIER: Record<AllInTier, "ALL_IN_TIER_0" | "ALL_IN_TIER_1" | "ALL_IN_TIER_2" | "ALL_IN_TIER_3" | "ALL_IN_TIER_4"> = {
  0: "ALL_IN_TIER_0",
  1: "ALL_IN_TIER_1",
  2: "ALL_IN_TIER_2",
  3: "ALL_IN_TIER_3",
  4: "ALL_IN_TIER_4",
};

/** Anchored accent: ring on the all-in player's own seat. Reserved for tiers ≥2 (meaningfully sized shoves) so it reads as an escalation, not noise on every min-bet all-in. */
const ALL_IN_SEAT_RING_LAYER = [
  { type: "RING" as const, anchor: "SEAT" as const, seatIndexFromPayload: "anchorSeat" as const, durationMs: 600, delayMs: 160 },
];

function buildAllInTier(tier: AllInTier): TableAnimationDefinition {
  const appendLayers = tier >= 2 ? ALL_IN_SEAT_RING_LAYER : undefined;
  return defFromPreset(FX_EVENT.ALL_IN, tier, PRESET_BY_TIER[tier], DURATIONS_MS[tier], { appendLayers });
}

export const ALL_IN_TIERS: TableAnimationDefinition[] = [
  buildAllInTier(0),
  buildAllInTier(1),
  buildAllInTier(2),
  buildAllInTier(3),
  buildAllInTier(4),
];
