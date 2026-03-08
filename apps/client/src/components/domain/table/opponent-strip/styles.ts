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
    width: "50%",
    paddingHorizontal: ROW.GAP / 2,
    marginBottom: ROW.GAP,
  },
  rowShell: {
    flexDirection: "column",
    minHeight: ROW.ITEM_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flex: 1,
    padding: ROW.PADDING,
    gap: 8,
    minHeight: 0,
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
  footerRow: {
    flex: 1,
    minHeight: CARDS.CELL_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  cardsDock: {
    flex: 1,
    minWidth: CARDS.CELL_MIN_WIDTH,
    minHeight: CARDS.CELL_MIN_HEIGHT,
    alignSelf: "stretch",
    alignItems: "stretch",
    justifyContent: "flex-end",
    zIndex: 2,
    elevation: 2,
    overflow: "hidden",
  },
  actionDock: {
    width: 44,
    minWidth: 44,
    justifyContent: "flex-end",
    paddingLeft: 2,
  },
  actionText: {
    fontSize: TEXT.STATUS_FONT_SIZE,
    lineHeight: TEXT.STATUS_FONT_SIZE + 2,
    minHeight: TEXT.STATUS_FONT_SIZE + 2,
    textAlign: "right",
  },
  cardsViewport: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
    alignItems: "stretch",
    justifyContent: "flex-end",
    zIndex: 2,
    elevation: 2,
  },
  cardsViewportRevealed: {
    zIndex: 4,
    elevation: 4,
  },
  cardsViewportContent: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    alignItems: "stretch",
    overflow: "hidden",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
    gap: CARDS.GAP,
    minHeight: CARDS.CELL_MIN_HEIGHT,
    overflow: "hidden",
  },
  cardSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  cardClip: {
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  cardScaledInner: {
    width: BASE_CARD_WIDTH,
    height: BASE_CARD_HEIGHT,
    position: "absolute",
    left: 0,
    top: 0,
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
