/**
 * Avatar disc / ring / badge / chip-stack visual tokens.
 *
 * Added for the GGPoker-style seat redesign (player-panel, opponent-item,
 * opponent-strip, hero-zone). Kept in its own file (rather than editing
 * colors.tokens.ts / radii.tokens.ts / spacing.tokens.ts) so parallel work on
 * the table surface / HUD chrome doesn't collide with this file.
 */

/** Ring drawn around the avatar disc; gold + glow when it's this seat's turn. */
export const AVATAR_RING = Object.freeze({
  IDLE_WIDTH: 2,
  ACTIVE_WIDTH: 3,
  /** Gap between the disc edge and the ring stroke. */
  PADDING: 3,
  /** Soft gold idle rim — reads as a frame, not a gray UI stroke. */
  IDLE_COLOR: "hsla(43, 35%, 58%, 0.42)",
  /** Matches the app's --c-gold token (42 82% 50%, see theme/tokens.css) so the ring and any `gold`/`text-gold` chrome read as one accent family. */
  ACTIVE_COLOR: "hsl(42, 82%, 55%)",
  ACTIVE_GLOW_COLOR: "hsl(42, 82%, 55%)",
  /** Same hue as ACTIVE_COLOR, translucent — used for the seat-plate boxShadow glow. */
  PANEL_GLOW_COLOR: "hsla(42, 82%, 55%, 0.35)",
  /** Extra diameter the outer glow halo extends past the ring. */
  GLOW_SPREAD: 12,
} as const);

/** Small status/tier badge overlapping the bottom-right of the avatar ring. */
export const AVATAR_BADGE = Object.freeze({
  SIZE: 18,
  BORDER_WIDTH: 2,
  BORDER_COLOR: "hsl(220, 22%, 8%)",
  BG_COLOR: "hsl(220, 16%, 22%)",
  TEXT_COLOR: "hsla(43, 70%, 72%, 0.95)",
  FONT_SIZE: 9,
} as const);

/** Static per-seat chip stack used to display the current round bet. */
export const CHIP_STACK = Object.freeze({
  DISC_SIZE: 15,
  /** Vertical offset between stacked discs (creates the stacked-chip look). */
  DISC_STEP: 3,
  MAX_DISCS: 3,
  RIM_DASH_COUNT: 8,
} as const);

/** Denomination-style color tiers for the chip stack (display heuristic only, not real chip values). */
export const CHIP_TIERS = [
  { maxCents: 500, bg: "hsl(206, 68%, 46%)", rim: "hsla(0, 0%, 100%, 0.75)" },
  { maxCents: 2_500, bg: "hsl(150, 52%, 36%)", rim: "hsla(0, 0%, 100%, 0.75)" },
  { maxCents: 10_000, bg: "hsl(2, 68%, 46%)", rim: "hsla(0, 0%, 100%, 0.75)" },
  { maxCents: Number.POSITIVE_INFINITY, bg: "hsl(266, 40%, 38%)", rim: "hsla(43, 90%, 70%, 0.85)" },
] as const;
