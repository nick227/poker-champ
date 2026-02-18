/** ActionBar height contract: sum of content so nothing is clipped. */

export const ACTION_BAR_PADDING = 16;
export const ACTION_BAR_GAP = 12;
export const STATUS_ROW_HEIGHT = 28;
export const BUTTONS_ROW_HEIGHT = 48;
export const BET_INPUT_ROW_HEIGHT = 44;
export const CHIPS_ROW_HEIGHT = 36;

export const ACTION_BAR_HEIGHT =
  ACTION_BAR_PADDING * 2 +
  STATUS_ROW_HEIGHT +
  ACTION_BAR_GAP * 3 +
  BUTTONS_ROW_HEIGHT +
  BET_INPUT_ROW_HEIGHT +
  CHIPS_ROW_HEIGHT;

export const ACTION_BAR_BREAKDOWN = {
  padding: ACTION_BAR_PADDING * 2,
  status: STATUS_ROW_HEIGHT,
  gaps: ACTION_BAR_GAP * 3,
  buttons: BUTTONS_ROW_HEIGHT,
  bet: BET_INPUT_ROW_HEIGHT,
  chips: CHIPS_ROW_HEIGHT,
} as const;
