/**
 * Board area layout contract.
 *
 * Layout values here describe internal spacing and card sizing.
 * The overall board band height (BOARD_AREA_HEIGHT) is defined in
 * constants/table-layout.constants.ts.
 *
 * Groups: CONTAINER, BOARD, CARDS, POT. Unprefixed names; folder provides scope.
 */

export const CONTAINER = Object.freeze({
  /** Vertical margin around board + pot block. */
  VERTICAL_MARGIN: 4,
} as const);

export const BOARD = Object.freeze({
  /** Spacing between community cards row and pot. */
  POT_MARGIN_BOTTOM: 12,
} as const);

export const CARDS = Object.freeze({
  GAP_DESKTOP: 10,
  GAP_MOBILE: 4,
  SCALE: 1.1,
  SCALE_LANDSCAPE: 1.25,
} as const);

export const POT = Object.freeze({
  PADDING_VERTICAL: 6,
  PADDING_HORIZONTAL: 18,
} as const);
