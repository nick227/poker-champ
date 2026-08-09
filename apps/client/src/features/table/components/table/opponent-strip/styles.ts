import { StyleSheet, type ViewStyle } from "react-native";
import { CONTAINER, ROW, CARDS, STAGE, SEAT_SLOT } from "./layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
import { TABLE_TILE_RADIUS } from "../tokens/radii.tokens";
import { AVATAR_RING } from "../tokens/avatar.tokens";

/** Side seat (left/right column) slot: leaves a gap in the middle for the board's sightline. */
export const sideSeatSlot: ViewStyle = {
  width: SEAT_SLOT.SIDE_WIDTH_PCT,
  flexBasis: SEAT_SLOT.SIDE_WIDTH_PCT,
  flexGrow: 0,
  flexShrink: 0,
};

/** Top-center seat slot: capped width so it doesn't balloon on very wide desktop viewports. */
export const topSeatSlot: ViewStyle = {
  width: SEAT_SLOT.TOP_WIDTH_PCT,
  maxWidth: SEAT_SLOT.TOP_MAX_WIDTH,
  flexGrow: 0,
  flexShrink: 0,
  alignSelf: "center",
};

/**
 * Legacy default slot width for OpponentStripItemView's un-measured (`fillSlot={false}`) render
 * path. OpponentStrip.tsx always measures seats now (`fillSlot` is always true — see
 * sideSeatSlot/topSeatSlot above, which size the actual seat/pair-row/top-row slots), so this is
 * only reachable if OpponentStripItem/View is ever rendered standalone outside OpponentStrip.
 */
export const tileSlotFlex: ViewStyle = {
  width: "50%",
  flexBasis: "50%",
  flexGrow: 0,
  flexShrink: 0,
};

/** Use when item is inside a slot wrapper (e.g. MeasuredBoundsReporter) so it fills the slot. */
const tileSlotFill: ViewStyle = {
  width: "100%",
  flexBasis: "100%",
  flexGrow: 1,
  flexShrink: 0,
};

export const opponentStripStyles = StyleSheet.create({
  strip: {
    width: "100%",
    paddingHorizontal: CONTAINER.HORIZONTAL_PADDING,
    paddingVertical: CONTAINER.VERTICAL_PADDING,
    marginTop: CONTAINER.MARGIN_TOP,
    marginBottom: CONTAINER.MARGIN_BOTTOM,
  },
  scrollContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  /** Felt "stage": one continuous surface behind the seating arc + board (see seatArrangement.ts). */
  stage: {
    width: "100%",
    maxWidth: STAGE.MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: STAGE.PADDING_HORIZONTAL,
    paddingTop: STAGE.PADDING_TOP,
    paddingBottom: STAGE.PADDING_BOTTOM,
  },
  /**
   * Desktop: fills stageHost. Felt paints via absoluteFill sibling; content is relative
   * and centered — felt must not flex-grow the document.
   */
  stageHostFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: STAGE.MAX_WIDTH_DESKTOP,
    alignSelf: "center",
    position: "relative",
  },
  stageContentFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: STAGE.PADDING_HORIZONTAL,
    paddingTop: STAGE.PADDING_TOP,
    paddingBottom: STAGE.PADDING_BOTTOM,
    zIndex: 1,
  },
  /** Top-center seat row (directly across the felt from the hero). */
  topRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: STAGE.ROW_GAP,
  },
  /** A left/right seat pair, flanking the felt at the same height. */
  pairRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: STAGE.ROW_GAP,
  },
  /** Board/pot sits in the visual center of the seating stack, not below it. */
  centerBoardRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  rowPressable: {
    ...tileSlotFlex,
    position: "relative",
    borderRadius: TABLE_TILE_RADIUS,
    paddingHorizontal: ROW.GAP / 2,
    marginBottom: ROW.GAP,
  },
  /** Outer wrapper when item is inside a slot (reporter); keeps padding/margin, fills slot. */
  rowPressableFillSlot: {
    ...tileSlotFill,
    position: "relative",
    borderRadius: TABLE_TILE_RADIUS,
    paddingHorizontal: ROW.GAP / 2,
    marginBottom: ROW.GAP,
  },
  /** Seat-plate chrome: rounded, subtly lifted off the felt via a soft drop shadow. */
  rowShell: {
    flexDirection: "column",
    minHeight: ROW.ITEM_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
    padding: ROW.ITEM_PADDING,
    position: "relative",
    boxShadow: [
      { offsetX: 0, offsetY: 2, blurRadius: 6, color: "hsla(0, 0%, 0%, 0.35)" },
    ] as const,
  },
  /** Dealer button: upper-right of opponent tile (m-2 = 8px). */
  dealerSlotTile: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3,
    elevation: 3,
  },
  /** Wrapper for PlayerPanel + cards column; stacks cards under text so cards never cover any text. */
  opponentItemWrapper: {
    flexDirection: "column",
    alignItems: "stretch",
    flex: 1,
    minWidth: 0,
    gap: 4,
    zIndex: 0,
    elevation: 0,
  },
  /** Cards row: snug under text, no dealer here. */
  cardsColumn: {
    height: CARDS.CELL_MIN_HEIGHT,
    minWidth: 0,
    alignSelf: "flex-end",
    marginTop: 2,
    zIndex: 2,
    elevation: 2,
  },
  cardsDock: {
    height: CARDS.CELL_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  cardsViewport: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 2,
  },
  cardsViewportRevealed: {
    zIndex: 4,
    elevation: 4,
  },
  cardsViewportContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: CARDS.GAP,
  },
  cardSlot: {
    justifyContent: "center",
    alignItems: "center",
  },
  cardScaledInner: {
    width: BASE_CARD_WIDTH,
    height: BASE_CARD_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  cardPlaceholder: {
    flex: 1,
    alignSelf: "stretch",
  },
  /** Turn countdown: a rounded capsule track inset from the tile edges (was a flush 4px underline). */
  turnBarTrack: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 6,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    zIndex: 1,
    elevation: 1,
    backgroundColor: "hsla(0, 0%, 0%, 0.35)",
  },
  turnBarFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: AVATAR_RING.ACTIVE_COLOR,
  },
});

export const PRESSABLE_HIT_SLOP = 8;
export const PRESSABLE_ANDROID_RIPPLE = { color: "rgba(255,255,255,0.08)" } as const;
