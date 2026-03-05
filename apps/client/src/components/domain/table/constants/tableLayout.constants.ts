/**
 * Single source of truth for table layout heights and shell chrome.
 * Organized by category: shell bands, board, hero zone, opponent strip, shared.
 */

// ─── Shell: vertical band heights ───────────────────────────────────────────
export const LAYOUT_GAME_TOP_BAR_HEIGHT = 52;
export const DEALER_BAR_HEIGHT = 50;

/** Fixed-height felt band (DealerAnnounceBar + board + pot). */
export const BOARD_AREA_HEIGHT = 194;
/** Felt band in landscape (larger board/cards). */
export const BOARD_AREA_HEIGHT_LANDSCAPE = 200;

export const GAME_AREA_HEIGHT = BOARD_AREA_HEIGHT + DEALER_BAR_HEIGHT;

export const ACTION_BAR_HEIGHT = 150;

// ─── Board: community cards ────────────────────────────────────────────────
export const COMMUNITY_CARD_GAP_DESKTOP = 32;
export const COMMUNITY_CARD_GAP_MOBILE = 4;
export const COMMUNITY_CARD_SCALE = 1.4;
export const COMMUNITY_CARD_SCALE_LANDSCAPE = 1.4;

// ─── Hero zone: hole-cards row (drives hero band height) ────────────────────
export const HERO_CARD_GAP = 10;
export const DEALER_BUTTON_SLOT_SIZE = 24;
export const CARD_ROW_HEIGHT = 92;
/** Vertical padding (each side) on the hole-cards column. */
export const HOLE_CARDS_COL_PADDING_VERTICAL = 16;
/** Hole-cards container height; all three hero columns fill this. */
const HERO_ROW_HEIGHT =
  CARD_ROW_HEIGHT + 2 * HOLE_CARDS_COL_PADDING_VERTICAL;
export const HERO_ZONE_HEIGHT = HERO_ROW_HEIGHT;

// ─── Opponent strip ────────────────────────────────────────────────────────
/** Max height: web vh, native ratio of window height. */
export const OPPONENT_STRIP_MAX_HEIGHT_VH = 96;
export const OPPONENT_STRIP_MAX_HEIGHT_RATIO = 0.16;
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
export const OPPONENT_CARD_GAP = 14;
export const OPPONENT_CARD_SCALE = 0.56;
export const OPPONENT_CARD_WIDTH = 22;
export const OPPONENT_CARD_HEIGHT = 32;
export const OPPONENT_CARDS_FULL_HEIGHT = Math.round(
  OPPONENT_CARD_HEIGHT * OPPONENT_CARD_SCALE
);

// ─── Canonical / shared ─────────────────────────────────────────────────────
/** Spacing tokens used across table bands/components. */
export const TABLE_SPACING = {
  edge: 10,
  bandGap: 8,
} as const;
