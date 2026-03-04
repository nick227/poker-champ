import { StyleSheet } from "react-native";
import {
  STRIP_HORIZONTAL_PADDING,
  STRIP_VERTICAL_PADDING,
  ROW_GAP,
  ROW_PADDING,
  TILE_STACK_GAP,
  AVATAR_SIZE,
  OPPONENT_ROW_MIN_HEIGHT,
  OPPONENT_CARD_WIDTH,
  OPPONENT_CARD_HEIGHT,
  OPPONENT_CARD_GAP,
  OPPONENT_CARD_SCALE,
} from "./constants/components/opponentStrip.layout";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import { STACK_TEXT_COLOR } from "./constants/style/tableColors";

export const opponentStripStyles = StyleSheet.create({
  strip: {
    width: "100%",
    paddingHorizontal: STRIP_HORIZONTAL_PADDING,
    paddingVertical: STRIP_VERTICAL_PADDING,
    marginTop: 40,
    marginBottom: 10,
  },
  scrollContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  rowPressable: {
    position: "relative",
    borderRadius: TABLE_TILE_RADIUS,
    width: "33.3333%",
    paddingHorizontal: ROW_GAP / 2,
    marginBottom: ROW_GAP,
  },
  rowShell: {
    flexDirection: "column",
    minHeight: OPPONENT_ROW_MIN_HEIGHT,
    borderRadius: TABLE_TILE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
  },
  tileContentStack: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: TILE_STACK_GAP,
    flex: 1,
    padding: ROW_PADDING,
    paddingBottom: ROW_PADDING + 4,
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
    width: "100%",
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
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 4,
    minHeight: 14,
    paddingHorizontal: 2,
  },
  nameText: {
    flexShrink: 1,
    maxWidth: "78%",
    textAlign: "center",
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
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: STACK_TEXT_COLOR,
  },
  actionText: {
    fontSize: 10,
    lineHeight: 12,
    minHeight: 12,
    textAlign: "center",
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
