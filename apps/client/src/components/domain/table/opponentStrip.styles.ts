import { StyleSheet } from "react-native";
import {
  OPPONENT_STRIP_HORIZONTAL_PADDING,
  OPPONENT_STRIP_VERTICAL_PADDING,
  OPPONENT_STRIP_MARGIN_TOP,
  OPPONENT_STRIP_MARGIN_BOTTOM,
  OPPONENT_ROW_GAP,
  OPPONENT_ROW_PADDING,
  OPPONENT_AVATAR_SIZE,
  OPPONENT_ITEM_MIN_HEIGHT,
  OPPONENT_NAME_FONT_SIZE,
  OPPONENT_STACK_FONT_SIZE,
  OPPONENT_STATUS_FONT_SIZE,
  OPPONENT_CARD_WIDTH,
  OPPONENT_CARD_HEIGHT,
  OPPONENT_CARD_GAP,
  OPPONENT_CARD_SCALE,
  OPPONENT_CARDS_FULL_HEIGHT,
} from "./constants/tableLayout.constants";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import { STACK_TEXT_COLOR } from "./constants/style/tableColors";

export const opponentStripStyles = StyleSheet.create({
  strip: {
    width: "100%",
    paddingHorizontal: OPPONENT_STRIP_HORIZONTAL_PADDING,
    paddingVertical: OPPONENT_STRIP_VERTICAL_PADDING,
    marginTop: OPPONENT_STRIP_MARGIN_TOP,
    marginBottom: OPPONENT_STRIP_MARGIN_BOTTOM,
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
    paddingHorizontal: OPPONENT_ROW_GAP / 2,
    marginBottom: OPPONENT_ROW_GAP,
  },
  rowShell: {
    flexDirection: "column",
    minHeight: OPPONENT_ITEM_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flex: 1,
    padding: OPPONENT_ROW_PADDING,
    gap: 10,
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
    width: "25%",
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  metaCol: {
    width: "75%",
    minHeight: OPPONENT_ITEM_MIN_HEIGHT - OPPONENT_ROW_PADDING * 2,
    justifyContent: "space-between",
  },
  nameRow: {
    height: "40%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    gap: 4,
    paddingRight: 4,
  },
  nameText: {
    flexShrink: 1,
    textAlign: "left",
    fontSize: OPPONENT_NAME_FONT_SIZE,
    lineHeight: OPPONENT_NAME_FONT_SIZE + 2,
  },
  stackRow: {
    height: "20%",
    justifyContent: "center",
    paddingRight: 4,
  },
  stackText: {
    fontSize: OPPONENT_STACK_FONT_SIZE,
    lineHeight: OPPONENT_STACK_FONT_SIZE + 2,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: STACK_TEXT_COLOR,
    textAlign: "left",
  },
  footerRow: {
    height: "40%",
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionDock: {
    width: "60%",
    justifyContent: "flex-start",
    paddingRight: 4,
  },
  actionText: {
    fontSize: OPPONENT_STATUS_FONT_SIZE,
    lineHeight: OPPONENT_STATUS_FONT_SIZE + 2,
    minHeight: OPPONENT_STATUS_FONT_SIZE + 2,
    textAlign: "left",
  },
  cardsDock: {
    width: "40%",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    position: "relative",
    paddingTop: 1,
    zIndex: 2,
    elevation: 2,
  },
  cardsViewport: {
    width: OPPONENT_CARD_WIDTH * 2 + OPPONENT_CARD_GAP,
    overflow: "visible",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    borderRadius: 8,
    zIndex: 2,
    elevation: 2,
  },
  cardsViewportRevealed: {
    zIndex: 4,
    elevation: 4,
  },
  cardsViewportContent: {
    justifyContent: "flex-end",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: OPPONENT_CARD_GAP,
    height: OPPONENT_CARDS_FULL_HEIGHT,
  },
  cardSlot: {
    width: OPPONENT_CARD_WIDTH,
    height: OPPONENT_CARD_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  cardScaled: {
    transform: [{ scale: OPPONENT_CARD_SCALE }],
  },
  cardPlaceholder: {
    height: OPPONENT_CARDS_FULL_HEIGHT,
  },
  avatar: {
    width: OPPONENT_AVATAR_SIZE,
    height: OPPONENT_AVATAR_SIZE,
    borderRadius: OPPONENT_AVATAR_SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: OPPONENT_AVATAR_SIZE,
    height: OPPONENT_AVATAR_SIZE,
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
