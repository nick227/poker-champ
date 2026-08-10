import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import { defFromPreset } from "./shared";

type PotWinTier = 0 | 1 | 2 | 3 | 4;

const DURATIONS_MS: Record<PotWinTier, number> = {
  0: 1200,
  1: 1400,
  2: 1600,
  3: 1800,
  4: 2200,
};

const PRESET_BY_TIER: Record<PotWinTier, "POT_TIER_0" | "POT_TIER_1" | "POT_TIER_2" | "POT_TIER_3" | "POT_TIER_4"> = {
  0: "POT_TIER_0",
  1: "POT_TIER_1",
  2: "POT_TIER_2",
  3: "POT_TIER_3",
  4: "POT_TIER_4",
};

/** Anchored accent: seat ring for the winner (no filled-disc board glow). */
const POT_WIN_ANCHORED_LAYERS = [
  { type: "RING" as const, anchor: "SEAT" as const, seatIndexFromPayload: "winnerSeat" as const, durationMs: 700, delayMs: 200 },
];

/** Sound 40ms after flash mimics response time and feels more satisfying. */
const POT_WIN_SOUND_DELAY_MS = 40;

function buildPotWinTier(tier: PotWinTier): TableAnimationDefinition {
  const sounds = tier >= 1 ? [{ sound: "table.potWin" as const, delayMs: POT_WIN_SOUND_DELAY_MS }] : undefined;
  const appendLayers = tier >= 1 ? POT_WIN_ANCHORED_LAYERS : undefined;
  return defFromPreset(FX_EVENT.POT_WIN, tier, PRESET_BY_TIER[tier], DURATIONS_MS[tier], { sounds, appendLayers });
}

export const POT_WIN_TIERS: TableAnimationDefinition[] = [
  buildPotWinTier(0),
  buildPotWinTier(1),
  buildPotWinTier(2),
  buildPotWinTier(3),
  buildPotWinTier(4),
];
