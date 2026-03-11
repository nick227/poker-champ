/**
 * Central constants for table FX: default copy, durations, validation messages, and defaults.
 * Use these instead of magic strings/numbers for better DX and refactor safety.
 */
import type { TableAnimationEvent } from "./animationTypes";

/** Log prefix for ANIMATION_DEBUG and validation warnings. */
export const FX_DEBUG_PREFIX = "[TableAnimation]";

/** When true, overlay draws rect outlines for BOARD/HERO/SEAT/CARD. Dev-only; never ships. Toggle to true locally to debug. */
export const FX_DEBUG_ANCHORS = (typeof __DEV__ !== "undefined" && __DEV__ && false) as boolean;

/** Default headline per event when payload.headline is missing. */
export const DEFAULT_HEADLINES: Record<TableAnimationEvent, string> = {
  POT_WIN: "YOU WIN",
  ALL_IN: "ALL IN",
  SHOWDOWN: "SHOWDOWN",
};

/** Fallback layer duration (ms) when definition omits durationMs. */
export const LAYER_DURATION_DEFAULT_MS = 400;

/** Fallback ASSET layer duration (ms) when definition omits durationMs. */
export const ASSET_DURATION_DEFAULT_MS = 800;

/** Text role for headline (primary text). */
export const TEXT_ROLE_HEADLINE = "headline";

/** Text role for amount (formatted cents). */
export const TEXT_ROLE_AMOUNT = "amount";

/** Default channel for definitions without per-event override. */
export const DEFAULT_CHANNEL = "TABLE";

/** Default anchor for definitions. */
export const DEFAULT_ANCHOR = "TABLE_CENTER";

/** Default text size when layer omits textSize. */
export const TEXT_SIZE_DEFAULT = "large";

/** Validation: duplicate (event, tier) key. */
export const ERROR_DUPLICATE_DEFINITION = "Duplicate animation definition";

/** Validation: empty layers array. */
export const ERROR_EMPTY_LAYERS = "layers array must not be empty";

/** Validation: invalid duration. */
export const ERROR_DURATION_POSITIVE = "durationMs must be > 0";

/** Validation: TEXT layer missing textRole. */
export const ERROR_TEXT_REQUIRES_ROLE = "TEXT layer requires textRole";

/** Validation: ASSET layer missing source. */
export const ERROR_ASSET_REQUIRES_SOURCE = "ASSET layer requires source";

/** Fraction of layer duration to hold at peak opacity before fading out (readability). */
export const HOLD_AT_PEAK_FRACTION = 0.06;

/** Minimum ms an animation must be displayed before it can be replaced by a new request (prevents starvation). */
export const MIN_DISPLAY_MS = 300;

/**
 * Casino-style cascade timing (intentional choreography, not arbitrary).
 *
 * 0ms   FLASH
 * 40ms  BURST
 * 80ms  PARTICLES / RADIAL_GLOW
 * 120ms RING + HEADLINE
 * 160ms BOARD_GLOW
 * 180ms AMOUNT
 * 200ms SEAT_RING
 */
export const CHOREO_FLASH_MS = 0;
export const CHOREO_BURST_MS = 40;
export const CHOREO_PARTICLES_MS = 80;
export const CHOREO_RING_MS = 120;
export const CHOREO_HEADLINE_MS = 120;
export const CHOREO_AMOUNT_MS = 180;

/** Guardrail: max delay for cascade layers; new layers should not exceed this. */
export const MAX_CASCADE_MS = 300;

/** Layer types to skip when reducedMotion is true (event and atmosphere). */
export const REDUCED_MOTION_SKIP_TYPES = ["PARTICLES", "STREAK", "BURST"] as const;

/** Filter out reduced-motion layer types; use for both event and atmosphere pipelines. */
export function filterReducedMotionLayers<T extends { type: string }>(layers: T[]): T[] {
  const skip = new Set<string>(REDUCED_MOTION_SKIP_TYPES);
  return layers.filter((l) => !skip.has(l.type));
}

/** Impact choreography: same cascade shape, slightly tighter for tier 4. */
export const IMPACT_CHOREO_FLASH_MS = 0;
export const IMPACT_CHOREO_BURST_MS = 40;
export const IMPACT_CHOREO_RADIAL_GLOW_MS = 80;
export const IMPACT_CHOREO_PARTICLES_MS = 80;
export const IMPACT_CHOREO_RING_MS = 120;
export const IMPACT_CHOREO_HEADLINE_MS = 120;
export const IMPACT_CHOREO_AMOUNT_MS = 180;
