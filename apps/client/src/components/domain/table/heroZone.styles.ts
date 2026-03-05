import { StyleSheet } from "react-native";
import {
  HERO_CARD_GAP,
  DEALER_BUTTON_SLOT_SIZE,
  CARD_ROW_HEIGHT,
} from "./constants/components/heroZone.layout";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import { ACTIVE_TILE_BORDER } from "./constants/style/tableColors";

export const heroZoneStyles = StyleSheet.create({
  root: {
    position: "relative",
    flexDirection: "column",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 0,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTurn: {
    borderBottomColor: ACTIVE_TILE_BORDER,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 8,
        color: "hsla(158, 100%, 50%, 1.00)",
      },
    ] as const,
    elevation: 6,
  },
  mainRow: {
    gap: 8,
    alignItems: "stretch",
  },
  holeCardsCol: {
    gap: 8,
  },
  holeCardsHeader: {
    gap: 6,
    minHeight: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRow: {
    height: CARD_ROW_HEIGHT,
    gap: HERO_CARD_GAP,
    alignItems: "center",
    justifyContent: "center",
  },
  stackCol: {
    gap: 4,
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  heroAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  heroAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  calcCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: DEALER_BUTTON_SLOT_SIZE,
  },
  dealerSlot: {
    width: DEALER_BUTTON_SLOT_SIZE,
    height: DEALER_BUTTON_SLOT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  sittingOutBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  sittingOutBadgeInner: {
    backgroundColor: "hsla(0, 0%, 0%, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
