import { StyleSheet } from "react-native";
import { STACK, DEALER_BUTTON, IDENTITY } from "./layout";
import { AVATAR_RING } from "../tokens/avatar.tokens";
import { TABLE_TILE_RADIUS } from "../tokens/radii.tokens";

export const playerPanelStyles = StyleSheet.create({
  panel: {
    gap: STACK.GAP,
    position: "relative",
    paddingRight: DEALER_BUTTON.SLOT_SIZE + STACK.DEALER_SLOT_OFFSET,
    alignSelf: "stretch",
    minWidth: 0,
    borderRadius: TABLE_TILE_RADIUS,
  },
  /** Seat-plate glow when it's this seat's turn — echoes the avatar ring color for a cohesive look. */
  panelActive: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 16,
        color: AVATAR_RING.PANEL_GLOW_COLOR,
      },
    ] as const,
    elevation: 5,
  },
  dealerSlot: {
    position: "absolute",
    top: DEALER_BUTTON.SLOT_TOP,
    right: DEALER_BUTTON.SLOT_RIGHT,
    width: DEALER_BUTTON.SLOT_SIZE,
    height: DEALER_BUTTON.SLOT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IDENTITY.GAP,
    minWidth: 0,
  },
  avatarWrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  holeCardsOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  holeCardsContent: {
    transform: [{ scale: 0.5 }],
  },
  nameStackCol: {
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },
  nameTextWrap: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    overflow: "hidden",
    paddingRight: 4,
    flexWrap: "wrap",
  },
  nameText: {
    minWidth: 0,
    maxWidth: "100%",
  },
  bottomRow: {
    minHeight: 20,
    justifyContent: "center",
  },
  bottomText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
