import { StyleSheet } from "react-native";
import { STACK, DEALER_BUTTON, AVATAR, IDENTITY } from "./layout";

export const playerPanelStyles = StyleSheet.create({
  panel: {
    gap: STACK.GAP,
    position: "relative",
    paddingRight: DEALER_BUTTON.SLOT_SIZE + STACK.DEALER_SLOT_OFFSET,
    alignSelf: "stretch",
    minWidth: 0,
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
  avatar: {
    width: AVATAR.SIZE,
    height: AVATAR.SIZE,
    borderRadius: 999,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: AVATAR.SIZE,
    height: AVATAR.SIZE,
    borderRadius: 999,
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
