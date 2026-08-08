import { StyleSheet, type ViewStyle } from "react-native";
import { CONTAINER, ROW, CARDS } from "./layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
import { TABLE_TILE_RADIUS } from "../tokens/radii.tokens";
import { AVATAR_RING } from "../tokens/avatar.tokens";

/** Shared width/flex for one tile slot (row item or seat bounds wrapper). */
export const tileSlotFlex: ViewStyle = {
  width: `${100 / ROW.ITEMS_PER_ROW}%`,
  flexBasis: `${100 / ROW.ITEMS_PER_ROW}%`,
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
