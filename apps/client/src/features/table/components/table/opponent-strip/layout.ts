/**
 * Opponent strip layout contract.
 *
 * - This file owns all layout constants for this component. No layout values
 *   live in global constants or other components.
 * - Constants are grouped by region (CONTAINER, ROW, AVATAR, TEXT, CARDS) for
 *   quick scanning and visual tweaks.
 * - Each group is exported as Object.freeze({ ... } as const) so it is
 *   immutable and keeps literal types.
 * - Names are unprefixed (e.g. AVATAR.SIZE, not OPPONENT_STRIP_AVATAR_SIZE);
 *   the folder provides scope.
 * - For shared primitives (radii, colors, card dimensions), import from
 *   ../tokens. Do not import layout from other components.
 */

export const CONTAINER = Object.freeze({
  MARGIN_TOP: 0,
  MARGIN_BOTTOM: 0,
  HORIZONTAL_PADDING: 10,
  VERTICAL_PADDING: 2,
} as const);

export const ROW = Object.freeze({
  GAP: 10,
  PADDING: 8,
  ITEM_MIN_HEIGHT: 120,
  /** Uniform padding inside each opponent item (x and y). */
  ITEM_PADDING: 8,
  /** Width of the dock to the right of cards/action for the dealer button (space always reserved). */
  DEALER_DOCK_WIDTH: 40,
} as const);

/**
 * Seat "stage": the felt surface encompassing the seating arc + board (see seatArrangement.ts).
 * Seats are grouped into a top-center seat, a left column, and a right column (top-to-bottom,
 * nearest the hero last) flanking a vertical stack of: far pair-rows, the board, then the pair
 * row nearest the hero — see OpponentStrip.tsx for the composition. Kept as simple percentage
 * widths (not real ellipse trig) so it stays robust from heads-up up to 9-max and across
 * viewport widths, per the table-scene redesign brief.
 */
export const STAGE = Object.freeze({
  /** Felt container: matches the board band's old max width so the table doesn't sprawl on ultra-wide desktop. */
  MAX_WIDTH: 1040,
  /** Desktop stage host: slightly wider when filling leftover height. */
  MAX_WIDTH_DESKTOP: 1200,
  PADDING_HORIZONTAL: 16,
  PADDING_TOP: 14,
  PADDING_BOTTOM: 10,
  /** Vertical gap between stacked pair-rows and the board row. */
  ROW_GAP: 6,
} as const);

export const SEAT_SLOT = Object.freeze({
  /** Each side seat's width as % of the pair row, leaving a gap for the board's sightline. */
  SIDE_WIDTH_PCT: "46%",
  /** Top-center seat's width as % of the stage, capped so it doesn't balloon on wide desktop. */
  TOP_WIDTH_PCT: "58%",
  TOP_MAX_WIDTH: 320,
} as const);

const AVATAR = Object.freeze({
  SIZE: 56,
} as const);

const TEXT = Object.freeze({
  NAME_FONT_SIZE: 21,
  STACK_FONT_SIZE: 11,
  STATUS_FONT_SIZE: 9,
} as const);

export const CARDS = Object.freeze({
  GAP: 0,
  CELL_MIN_WIDTH: 98,
  /** Fixed height of the cards row; card scale is derived from this. */
  CELL_MIN_HEIGHT: 0,
  /** Rotation in degrees: left card negative, right card positive (fan out). */
  FAN_ANGLE_DEG: 15,
  /** Overlap between the two cards (positive = overlap by this much). */
  PAIR_OVERLAP: 6,
} as const);
