/** HeroZone fixed height so TableLayout stays aligned; content fits within. */

export const HERO_ZONE_HEIGHT = 200;

export const HERO_ZONE_BREAKDOWN = {
  calcStrip: 40,
  padding: 16 * 2,
  content: HERO_ZONE_HEIGHT - 40 - 32,
} as const;
