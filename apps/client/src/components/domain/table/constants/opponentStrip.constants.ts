/** OpponentStrip: 4-row tile layout. Each row has ROW_PADDING (2px). */

export const CONTAINER_PADDING = 12;
export const ROW_PADDING = 2;
export const TILE_RADIUS = 14;
export const TILE_WIDTH = 150;
export const TILE_PADDING = 8;
export const AVATAR_SIZE = 28;
export const DEALER_SLOT = 24;

/** Row heights (content only; each row also has ROW_PADDING * 2 vertical padding). */
export const CARD_ROW_HEIGHT = 100;
export const USERNAME_ROW_HEIGHT = 20;
export const ACTION_ROW_HEIGHT = 15;
export const AVATAR_STACK_ROW_HEIGHT = 75;

const rowWithPadding = (h: number) => h + ROW_PADDING * 2;
export const OPPONENT_TILE_HEIGHT =
  rowWithPadding(CARD_ROW_HEIGHT) +
  rowWithPadding(USERNAME_ROW_HEIGHT) +
  rowWithPadding(ACTION_ROW_HEIGHT) +
  rowWithPadding(AVATAR_STACK_ROW_HEIGHT);

export const OPPONENT_ROW_GAP = CONTAINER_PADDING;
export const OPPONENT_STRIP_PADDING_V = CONTAINER_PADDING;
export const OPPONENT_STRIP_BUFFER = CONTAINER_PADDING;

export const OPPONENT_STRIP_HEIGHT =
  OPPONENT_STRIP_PADDING_V * 2 +
  OPPONENT_TILE_HEIGHT * 2 +
  OPPONENT_ROW_GAP +
  OPPONENT_STRIP_BUFFER;

/** PlayingCard base size (must match PlayingCard.tsx). */
const CARD_BASE_WIDTH = 48;
const CARD_BASE_HEIGHT = 68;

export const CARD_GAP = 6;

/** Available space in card row: tile width minus padding, row content height. */
const availableCardRowWidth = TILE_WIDTH - 2 * TILE_PADDING - CARD_GAP;
const availableWidthPerCard = availableCardRowWidth / 2;
const availableCardRowHeight = CARD_ROW_HEIGHT;

/** Scale so two cards proportionally fill the space (aspect 48:68). */
const cardScale = Math.min(
  availableWidthPerCard / CARD_BASE_WIDTH,
  availableCardRowHeight / CARD_BASE_HEIGHT
);
export const OPPONENT_CARD_SCALE = cardScale;
export const OPPONENT_CARD_WIDTH = Math.floor(CARD_BASE_WIDTH * cardScale);
export const OPPONENT_CARD_HEIGHT = Math.floor(CARD_BASE_HEIGHT * cardScale);

/** For emergency fallback when viewport < TOTAL_FIXED_HEIGHT. ActionBar is never reduced. */
export const OPPONENT_STRIP_HEIGHT_FALLBACK = 300;

export const OPPONENT_STRIP_BREAKDOWN = {
  paddingVertical: OPPONENT_STRIP_PADDING_V * 2,
  tileHeight: OPPONENT_TILE_HEIGHT,
  rowGap: OPPONENT_ROW_GAP,
  containerPadding: CONTAINER_PADDING,
  rowPadding: ROW_PADDING,
} as const;
