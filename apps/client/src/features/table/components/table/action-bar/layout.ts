/**
 * Action bar layout — deliberate spacing for a professional control strip.
 */

export const CONTAINER = Object.freeze({
  PADDING: 0,
  GAP: 8,
  PADDING_HORIZONTAL: 16,
} as const);

export const STATUS = Object.freeze({
  ROW_HEIGHT: 26,
} as const);

export const BUTTONS = Object.freeze({
  ROW_HEIGHT: 46,
  BET_INPUT_ROW_HEIGHT: 40,
  CHIPS_ROW_HEIGHT: 32,
  GAP: 8,
  CHIPS_GAP: 6,
} as const);
