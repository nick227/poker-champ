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
  CELL_MIN_HEIGHT: 72,
} as const);
