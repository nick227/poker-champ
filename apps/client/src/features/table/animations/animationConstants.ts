/**
 * Central constants for table FX: default copy, durations, validation messages, and defaults.
 * Use these instead of magic strings/numbers for better DX and refactor safety.
 */
import type { TableAnimationEvent } from "./animationTypes";

/** Log prefix for ANIMATION_DEBUG and validation warnings. */
export const FX_DEBUG_PREFIX = "[TableAnimation]";

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

/** Choreography: stagger so flash → burst → ring → text. Design: peak impact 400–600 ms. */
export const CHOREO_FLASH_MS = 0;
export const CHOREO_BURST_MS = 50;
export const CHOREO_PARTICLES_MS = 60;
export const CHOREO_RING_MS = 100;
export const CHOREO_HEADLINE_MS = 120;
export const CHOREO_AMOUNT_MS = 180;
