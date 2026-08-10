/**
 * Dark stage (void) behind the felt — separate from felt.tokens so parallel agents
 * can keep editing rail geometry without merge thrash.
 */

/** Near-black theater behind the table (not app-panel gray). */
export const STAGE_VOID_BG = "hsl(220, 22%, 5%)";

/** Soft vignette over the void — web radial; native uses a darker fill. */
export const STAGE_VIGNETTE = Object.freeze({
  center: "hsla(220, 18%, 10%, 0)",
  edge: "hsla(220, 30%, 2%, 0.72)",
} as const);

/** Soft lift under the oval so the table reads as furniture, not a flat UI oval. */
export const STAGE_TABLE_LIFT = "hsla(0, 0%, 0%, 0.55)";
