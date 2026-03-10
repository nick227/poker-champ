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
  MAX_HEIGHT_VH: 96,
  MAX_HEIGHT_RATIO: 0.16,
  MARGIN_TOP: 0,
  MARGIN_BOTTOM: 0,
  HORIZONTAL_PADDING: 10,
  VERTICAL_PADDING: 6,
} as const);

export const ROW = Object.freeze({
  GAP: 10,
  PADDING: 8,
  ITEM_MIN_HEIGHT: 120,
  /** Number of opponent tiles per row in the strip (width = 100% / ITEMS_PER_ROW). */
  ITEMS_PER_ROW: 4,
  /** Uniform padding inside each opponent item (x and y). */
  ITEM_PADDING: 8,
  /** Width of the dock to the right of cards/action for the dealer button (space always reserved). */
  DEALER_DOCK_WIDTH: 40,
} as const);

export const AVATAR = Object.freeze({
  SIZE: 56,
} as const);

export const TEXT = Object.freeze({
  NAME_FONT_SIZE: 21,
  STACK_FONT_SIZE: 11,
  STATUS_FONT_SIZE: 9,
} as const);

export const CARDS = Object.freeze({
  GAP: 0,
  CELL_MIN_WIDTH: 98,
  /** Fixed height of the cards row; card scale is derived from this. */
  CELL_MIN_HEIGHT: 56,
  /** Rotation in degrees: left card negative, right card positive (fan out). */
  FAN_ANGLE_DEG: 15,
  /** Overlap between the two cards (positive = overlap by this much). */
  PAIR_OVERLAP: 6,
} as const);
