import { StyleSheet } from "react-native";
import {
  CONTAINER_PADDING,
  TILE_WIDTH,
  TILE_PADDING,
  ROW_PADDING,
  OPPONENT_ROW_GAP,
  OPPONENT_CARD_ROW_HEIGHT,
  OPPONENT_USERNAME_ROW_HEIGHT,
  OPPONENT_ACTION_ROW_HEIGHT,
  OPPONENT_AVATAR_STACK_ROW_HEIGHT,
  AVATAR_SIZE,
  OPPONENT_TILE_HEIGHT,
  OPPONENT_CARD_WIDTH,
  OPPONENT_CARD_HEIGHT,
  OPPONENT_CARD_GAP,
  OPPONENT_CARD_SCALE,
  CONTAINER_HORIZONTAL_PADDING,
  CONTAINER_VERTICAL_PADDING,
  CONTAINER_BOTTOM_PADDING,
} from "./constants/components/opponentStrip.layout";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import {
  ACTIVE_TILE_BORDER,
  ACTIVE_USERNAME_COLOR,
  INACTIVE_USERNAME_COLOR,
  STACK_TEXT_COLOR,
} from "./constants/style/tableColors";

const ROW_BASE = ROW_PADDING * 2;

export const opponentStripStyles = StyleSheet.create({
  strip: {
    width: "100%",
    overflow: "hidden",
  },
  /** Fill fixed-height band without % or flex:1; alignSelf: stretch uses parent height. */
  scrollViewFill: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
  },
  scrollContent: {
    paddingHorizontal: CONTAINER_HORIZONTAL_PADDING,
    paddingVertical: CONTAINER_VERTICAL_PADDING,
    paddingTop: CONTAINER_VERTICAL_PADDING,
    paddingBottom: CONTAINER_BOTTOM_PADDING,
    alignItems: "stretch",
  },
  horizontalScrollContent: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  opponentRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: OPPONENT_ROW_GAP,
    flexShrink: 0,
  },
  tile: {
    width: TILE_WIDTH,
    height: OPPONENT_TILE_HEIGHT,
    padding: TILE_PADDING,
    flexDirection: "column",
    borderRadius: TABLE_TILE_RADIUS,
    overflow: "hidden",
  },
  tileActive: {
    borderColor: ACTIVE_TILE_BORDER,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 8,
        color: "hsla(158, 52%, 42%, 0.35)",
      },
    ] as const,
    elevation: 6,
  },
  cardRow: {
    height: OPPONENT_CARD_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center",
    alignItems: "center",
  },
  cardRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: OPPONENT_CARD_GAP,
    height: OPPONENT_CARD_HEIGHT,
  },
  card: {
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
  usernameRow: {
    height: OPPONENT_USERNAME_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center",
  },
  usernameText: {
    fontSize: 12,
    fontWeight: "500",
    color: INACTIVE_USERNAME_COLOR,
  },
  usernameTextActive: {
    color: ACTIVE_USERNAME_COLOR,
  },
  actionRow: {
    height: OPPONENT_ACTION_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center",
  },
  avatarStackRow: {
    height: OPPONENT_AVATAR_STACK_ROW_HEIGHT,
    padding: ROW_PADDING,
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_PADDING,
  },
  avatarCol: {
    flex: 1,
    maxWidth: AVATAR_SIZE,
    minWidth: 0,
  },
  stackCol: {
    flex: 3,
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
  stackText: {
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: STACK_TEXT_COLOR,
  },
  contentWrapper: {
    position: "relative",
  },
  dealerBadge: {
    position: "absolute",
    bottom: 10,
    left: "50%",
    right: 10,
    zIndex: 1,
    alignItems: "flex-end",
  },
});

export const PRESSABLE_HIT_SLOP = 8;
export const PRESSABLE_ANDROID_RIPPLE = { color: "rgba(255,255,255,0.08)" } as const;
