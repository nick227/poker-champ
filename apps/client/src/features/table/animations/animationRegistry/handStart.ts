import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import { defFromPreset } from "./shared";

/** Quiet felt wake-up when a new hand is dealt (~1100ms). */
export const HAND_START_DURATION_MS = 1100;

export const HAND_START_TIERS: TableAnimationDefinition[] = [
  defFromPreset(FX_EVENT.HAND_START, 0, "HAND_START", HAND_START_DURATION_MS),
];
