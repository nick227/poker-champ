/**
 * Action bar layout — single primary act row + optional sizing chips.
 */

export const CONTAINER = Object.freeze({
  PADDING: 0,
  GAP: 8,
  PADDING_HORIZONTAL: 16,
} as const);

export const STATUS = Object.freeze({
  /** Kept for waiting-state panels; acting HUD no longer hosts status. */
  ROW_HEIGHT: 26,
} as const);

export const BUTTONS = Object.freeze({
  ROW_HEIGHT: 54,
  BET_INPUT_ROW_HEIGHT: 40,
  CHIPS_ROW_HEIGHT: 32,
  GAP: 10,
  CHIPS_GAP: 8,
  LABEL_SIZE: 18,
} as const);
