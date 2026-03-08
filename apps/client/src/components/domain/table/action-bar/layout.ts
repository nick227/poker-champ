/**
 * Action bar layout contract.
 *
 * Layout values here describe internal spacing and row heights.
 * The overall ActionBar band height is defined by ACTION_BAR_HEIGHT
 * in constants/table-layout.constants.ts.
 *
 * Groups: CONTAINER, STATUS, BUTTONS. Unprefixed names; folder provides scope.
 */

export const CONTAINER = Object.freeze({
  PADDING: 0,
  GAP: 12,
  PADDING_HORIZONTAL: 12,
} as const);

export const STATUS = Object.freeze({
  ROW_HEIGHT: 28,
} as const);

export const BUTTONS = Object.freeze({
  ROW_HEIGHT: 48,
  BET_INPUT_ROW_HEIGHT: 44,
  CHIPS_ROW_HEIGHT: 36,
  GAP: 12,
  CHIPS_GAP: 8,
} as const);
