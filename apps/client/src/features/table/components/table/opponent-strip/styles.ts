import { StyleSheet } from "react-native";
import { CONTAINER, ROW, AVATAR, TEXT, CARDS } from "./layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
import { TABLE_TILE_RADIUS } from "../tokens/radii.tokens";
import { STACK_TEXT_COLOR } from "../tokens/colors.tokens";

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
    position: "relative",
    borderRadius: TABLE_TILE_RADIUS,
    width: `${100 / ROW.ITEMS_PER_ROW}%`,
    paddingHorizontal: ROW.GAP / 2,
    marginBottom: ROW.GAP,
  },
  rowShell: {
    flexDirection: "column",
    minHeight: ROW.ITEM_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
    padding: ROW.ITEM_PADDING,
  },
  contentRow: {
    flexDirection: "column",
    alignItems: "stretch",
    flex: 1,
    gap: 8,
    minHeight: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  rowShellActive: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 28,
        color: "hsla(0, 100%, 100%, 0.8)",
      },
    ] as const,
    elevation: 6,
  },
  avatarCol: {
    width: AVATAR.SIZE + 4,
    minWidth: AVATAR.SIZE + 4,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: "space-between",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    minHeight: TEXT.NAME_FONT_SIZE + 4,
  },
  nameText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "left",
    fontSize: TEXT.NAME_FONT_SIZE,
    lineHeight: TEXT.NAME_FONT_SIZE + 2,
  },
  stackRow: {
    justifyContent: "center",
    minHeight: TEXT.STACK_FONT_SIZE + 4,
    paddingRight: 4,
  },
  stackText: {
    fontSize: TEXT.STACK_FONT_SIZE,
    lineHeight: TEXT.STACK_FONT_SIZE + 2,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: STACK_TEXT_COLOR,
    textAlign: "left",
  },
  cardsDock: {
    height: CARDS.CELL_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: TEXT.STATUS_FONT_SIZE + 8,
  },
  dealerDock: {
    minHeight: TEXT.STATUS_FONT_SIZE + 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: TEXT.STATUS_FONT_SIZE,
    lineHeight: TEXT.STATUS_FONT_SIZE + 2,
    minHeight: TEXT.STATUS_FONT_SIZE + 2,
    textAlign: "left",
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
  avatar: {
    width: AVATAR.SIZE,
    height: AVATAR.SIZE,
    borderRadius: AVATAR.SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: AVATAR.SIZE,
    height: AVATAR.SIZE,
  },
  turnBarTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  turnBarFill: {
    height: "100%",
    backgroundColor: "hsl(142, 76%, 36%)",
  },
});

export const PRESSABLE_HIT_SLOP = 8;
export const PRESSABLE_ANDROID_RIPPLE = { color: "rgba(255,255,255,0.08)" } as const;
