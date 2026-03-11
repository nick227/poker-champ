/**
 * Overall layout rules only: shell band heights and global layout contract.
 * Component-internal values live in each component's layout.ts.
 */

export const LAYOUT_GAME_TOP_BAR_HEIGHT = 52;
export const DEALER_BAR_HEIGHT = 50;

export const BOARD_AREA_HEIGHT = 160;
export const BOARD_AREA_HEIGHT_LANDSCAPE = 180;

export const GAME_AREA_HEIGHT = BOARD_AREA_HEIGHT + DEALER_BAR_HEIGHT;

export const ACTION_BAR_HEIGHT = 200;

/** Vertical band height for hero section. Shell contract; component layout lives in hero-zone/layout.ts. */
export const HERO_ZONE_HEIGHT = 124;
