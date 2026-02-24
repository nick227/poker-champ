/**
 * Single source of truth for table layout heights and shell chrome.
 * Only vertical band contracts and shared shell class names belong here.
 */

export const LAYOUT_TITLE_HEIGHT = 70;
export const LAYOUT_TOP_BAR_HEIGHT = 52;
export const GAME_AREA_HEIGHT = 244;
export const OPPONENT_STRIP_HEIGHT = 250;
export const HERO_ZONE_HEIGHT = 200;
export const ACTION_BAR_HEIGHT = 224;
export const DEALER_BAR_HEIGHT = 50;

/** Used when no snapshot (StatusShell); keeps placeholder player count consistent. */
export const DEFAULT_MAX_SEATS = 6;

/** Shared shell section class names so all states (StatusShell, EmptyTableView, TableLayout) stay consistent. */
export const TABLE_SHELL_TITLE_CLASSNAME = "mb-4";
export const TABLE_SHELL_TOP_BAR_CLASSNAME = "border-t border-b border-border-subtle mb-4";
