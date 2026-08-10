/**
 * GG-style turn theater — orange ring + countdown. Separate from avatar.tokens
 * so parallel avatar disc work doesn't collide.
 */

export const TURN_AURA = Object.freeze({
  /** Outer ring thickness beyond the avatar. */
  PAD: 5,
  RING_WIDTH: 4,
  /** Remaining-time arc (GG flame orange). */
  ARC: "hsl(24, 95%, 52%)",
  ARC_LOW: "hsl(8, 90%, 52%)",
  /** Track behind the arc. */
  TRACK: "hsla(220, 12%, 18%, 0.75)",
  GLOW: "hsla(24, 95%, 52%, 0.45)",
  /** Countdown chip. */
  BADGE_BG: "hsla(12, 85%, 42%, 0.95)",
  BADGE_BORDER: "hsla(40, 90%, 60%, 0.85)",
  BADGE_TEXT: "#fff7ed",
} as const);
