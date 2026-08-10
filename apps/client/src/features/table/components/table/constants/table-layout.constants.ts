/**
 * Overall layout rules only: shell band heights and global layout contract.
 * Component-internal values live in each component's layout.ts.
 */

export const LAYOUT_GAME_TOP_BAR_HEIGHT = 52;
export const DEALER_BAR_HEIGHT = 50;

export const BOARD_AREA_HEIGHT = 160;
export const BOARD_AREA_HEIGHT_LANDSCAPE = 180;

export const GAME_AREA_HEIGHT = BOARD_AREA_HEIGHT + DEALER_BAR_HEIGHT;

/**
 * Acting HUD: primary act row (54) + optional wager input (40) + gaps/padding.
 * Action copy lives on the felt, not in this band.
 */
export const ACTION_BAR_HEIGHT = 120;

/** Vertical band height for hero section. Shell contract; component layout lives in hero-zone/layout.ts. */
export const HERO_ZONE_HEIGHT = 124;

/** Fixed height for opponent strip area when loading (placeholder). Prevents layout reflow on reveal. */
export const OPPONENT_STRIP_HEIGHT = 110;

/** Duration (ms) for table body fade-in when reveal latch fires. Table body only; top bar and dealer bar stay outside. */
export const TABLE_REVEAL_MS = 180;
