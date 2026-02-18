/** OpponentStrip: card-first identity tiles. No chip stacks. Heights add up so 2 rows fit. */

export const CHIP_RADIUS = 14;
export const CARD_ZONE_HEIGHT = 100;
export const INFO_BAR_HEIGHT = 48;
export const AVATAR_SIZE = 24;
/** Reserve space for DealerButton (small is 24px). */
export const DEALER_SLOT = 24;

/** Tile height = card zone + identity bar (no internal padding). */
export const OPPONENT_CHIP_HEIGHT = CARD_ZONE_HEIGHT + INFO_BAR_HEIGHT;

export const OPPONENT_ROW_GAP = 8;
export const OPPONENT_STRIP_PADDING_V = 10;
export const OPPONENT_STRIP_BUFFER = 12;

export const OPPONENT_STRIP_HEIGHT =
  OPPONENT_STRIP_PADDING_V * 2 +
  OPPONENT_CHIP_HEIGHT * 2 +
  OPPONENT_ROW_GAP +
  OPPONENT_STRIP_BUFFER;

/** Card scale in opponent tile (larger for readability). */
export const OPPONENT_CARD_SCALE = 0.84;

/** For emergency fallback when viewport < TOTAL_FIXED_HEIGHT. ActionBar is never reduced. */
export const OPPONENT_STRIP_HEIGHT_FALLBACK = 300;

export const OPPONENT_STRIP_BREAKDOWN = {
  paddingVertical: OPPONENT_STRIP_PADDING_V * 2,
  chipHeight: OPPONENT_CHIP_HEIGHT,
  cardZone: CARD_ZONE_HEIGHT,
  infoBar: INFO_BAR_HEIGHT,
  rowGap: OPPONENT_ROW_GAP,
  buffer: OPPONENT_STRIP_BUFFER,
} as const;
