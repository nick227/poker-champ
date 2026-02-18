/**
 * Single source of truth for table layout heights.
 * TableLayout owns stacking + spacers; children own their internal math.
 * Import this for remaining-height checks and graceful degradation.
 */

export const LAYOUT_TITLE_HEIGHT = 80;
export const LAYOUT_TOP_BAR_HEIGHT = 52;
export const GAME_AREA_HEIGHT = 210;

export {
  OPPONENT_STRIP_HEIGHT,
  OPPONENT_STRIP_HEIGHT_FALLBACK,
} from "./opponentStrip.constants";
export { HERO_ZONE_HEIGHT } from "./heroZone.constants";
export { ACTION_BAR_HEIGHT } from "./actionBar.constants";

import { OPPONENT_STRIP_HEIGHT } from "./opponentStrip.constants";
import { HERO_ZONE_HEIGHT } from "./heroZone.constants";
import { ACTION_BAR_HEIGHT } from "./actionBar.constants";

export const TOTAL_FIXED_HEIGHT =
  LAYOUT_TITLE_HEIGHT +
  LAYOUT_TOP_BAR_HEIGHT +
  OPPONENT_STRIP_HEIGHT +
  GAME_AREA_HEIGHT +
  HERO_ZONE_HEIGHT +
  ACTION_BAR_HEIGHT;

/** Emergency fallback HeroZone height when viewport < TOTAL_FIXED_HEIGHT. */
export const HERO_ZONE_HEIGHT_FALLBACK = 180;
