/**
 * Single source of truth for table layout heights and shell chrome.
 * Only vertical band contracts and shared shell class names belong here.
 */

export const LAYOUT_GAME_TOP_BAR_HEIGHT = 52;
export const DEALER_BAR_HEIGHT = 40;

/** Fixed-height felt band inside the game area (DealerAnnounceBar + board + pot chip). */
export const BOARD_AREA_HEIGHT = 164;
/** Felt band height in landscape mode (slightly larger board/cards). */
export const BOARD_AREA_HEIGHT_LANDSCAPE = 200;

/** Total game area: dealer bar spacer + felt band. */
export const GAME_AREA_HEIGHT = BOARD_AREA_HEIGHT + DEALER_BAR_HEIGHT;

export const HERO_ZONE_HEIGHT = 130;
export const ACTION_BAR_HEIGHT = 150;

/** Opponent strip layout tuning. */
/** Max height of the strip: web uses vh, native uses ratio of window height. */
export const OPPONENT_STRIP_MAX_HEIGHT_VH = 96;
export const OPPONENT_STRIP_MAX_HEIGHT_RATIO = 0.16;
/** Vertical margins around the strip; they add to the section’s content height. */
export const OPPONENT_STRIP_MARGIN_TOP = 0;
export const OPPONENT_STRIP_MARGIN_BOTTOM = 0;
export const OPPONENT_STRIP_HORIZONTAL_PADDING = 10;
export const OPPONENT_STRIP_VERTICAL_PADDING = 6;
export const OPPONENT_ROW_GAP = 6;
export const OPPONENT_ROW_PADDING = 8;
export const OPPONENT_AVATAR_SIZE = 56;
export const OPPONENT_ITEM_MIN_HEIGHT = 108;
export const OPPONENT_NAME_FONT_SIZE = 21;
export const OPPONENT_STACK_FONT_SIZE = 11;
export const OPPONENT_STATUS_FONT_SIZE = 9;
export const OPPONENT_CARD_GAP = 0;
export const OPPONENT_CARD_SCALE = 0.56;
export const OPPONENT_CARD_WIDTH = 22;
export const OPPONENT_CARD_HEIGHT = 32;
export const OPPONENT_CARDS_CROPPED_HEIGHT = 19;
export const OPPONENT_CARDS_FULL_HEIGHT = Math.round(OPPONENT_CARD_HEIGHT * OPPONENT_CARD_SCALE);

/** Community board card layout tuning. */
export const COMMUNITY_CARD_GAP_DESKTOP = 32;
export const COMMUNITY_CARD_GAP_MOBILE = 4;
export const COMMUNITY_CARD_SCALE = 1;
export const COMMUNITY_CARD_SCALE_LANDSCAPE = 1.4;

/** Canonical vertical layout contract for the table scene. */
export const TABLE_LAYOUT = {
  topBar: LAYOUT_GAME_TOP_BAR_HEIGHT,
  dealerBar: DEALER_BAR_HEIGHT,
  boardArea: BOARD_AREA_HEIGHT,
  gameArea: GAME_AREA_HEIGHT,
  hero: HERO_ZONE_HEIGHT,
  actionBar: ACTION_BAR_HEIGHT,
} as const;

/** Shared spacing tokens used across table bands/components. */
export const TABLE_SPACING = {
  edge: 10,
  bandGap: 8,
} as const;
