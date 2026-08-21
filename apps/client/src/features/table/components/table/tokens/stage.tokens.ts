/**
 * Stage atmosphere tokens — separate from felt.tokens so parallel agents
 * can keep editing rail geometry without merge thrash.
 */

/**
 * Soft vignette behind the felt — web radial; native uses a translucent fill.
 * Kept light: this sits over the app's custom background preset, so it should
 * read as a gentle depth cue, not a haze that hides the preset.
 */
export const STAGE_VIGNETTE = Object.freeze({
  center: "hsla(220, 18%, 10%, 0)",
  edge: "hsla(220, 30%, 2%, 0.28)",
} as const);

/** Soft lift under the oval so the table reads as furniture, not a flat UI oval. */
export const STAGE_TABLE_LIFT = "hsla(0, 0%, 0%, 0.55)";
