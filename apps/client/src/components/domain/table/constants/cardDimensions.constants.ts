/** Single source of truth for card dimensions and aspect ratio */

/** Base card dimensions (1.0 scale) */
export const BASE_CARD_WIDTH = 60;
export const BASE_CARD_HEIGHT = 80;

/** Standard card scales used throughout the app */
export const CARD_SCALES = {
  MINI: 0.6,
  SMALL: 0.8,
  NORMAL: 1.0,
  LARGE: 1.2,
  COMMUNITY: 1.4,
} as const;

/** Helper function to get card dimensions with scale multiplier */
export function getCardDimensions(scale: number = 1.0) {
  return {
    width: BASE_CARD_WIDTH * scale,
    height: BASE_CARD_HEIGHT * scale,
  };
}

/** Default card dimensions (NORMAL scale) */
export const DEFAULT_CARD_DIMENSIONS = getCardDimensions(CARD_SCALES.NORMAL);
