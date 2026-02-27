import { StyleSheet } from "react-native";
import {
  STRIP_HORIZONTAL_PADDING,
  STRIP_VERTICAL_PADDING,
  ROW_GAP,
  ROW_PADDING,
  AVATAR_SIZE,
  OPPONENT_ROW_MIN_HEIGHT,
  OPPONENT_CARDS_COL_WIDTH,
  OPPONENT_CARD_WIDTH,
  OPPONENT_CARD_HEIGHT,
  OPPONENT_CARD_GAP,
  OPPONENT_CARD_SCALE,
} from "./constants/components/opponentStrip.layout";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import {
  ACTIVE_TILE_BORDER,
  STACK_TEXT_COLOR,
} from "./constants/style/tableColors";

export const opponentStripStyles = StyleSheet.create({
  strip: {
    width: "100%",
    paddingHorizontal: STRIP_HORIZONTAL_PADDING,
    paddingVertical: STRIP_VERTICAL_PADDING,
  },
  scrollContent: {
    gap: ROW_GAP,
  },
  rowPressable: {
    position: "relative",
    borderRadius: TABLE_TILE_RADIUS,
  },
  rowShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: OPPONENT_ROW_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
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
  cardsCol: {
    width: OPPONENT_CARDS_COL_WIDTH,
    minHeight: OPPONENT_ROW_MIN_HEIGHT,
    padding: ROW_PADDING,
    borderRightWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: OPPONENT_CARD_GAP,
    height: OPPONENT_CARD_HEIGHT,
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
    height: OPPONENT_CARD_HEIGHT,
  },
  infoCol: {
    flex: 1,
    minHeight: OPPONENT_ROW_MIN_HEIGHT,
    padding: ROW_PADDING,
    justifyContent: "space-between",
  },
  infoTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  nameWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  stackText: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: STACK_TEXT_COLOR,
  },
  actionText: {
    fontSize: 11,
    lineHeight: 14,
  },
});

export const PRESSABLE_HIT_SLOP = 8;
export const PRESSABLE_ANDROID_RIPPLE = { color: "rgba(255,255,255,0.08)" } as const;
