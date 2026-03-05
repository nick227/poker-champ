import { StyleSheet } from "react-native";
import {
  HERO_CARD_GAP,
  DEALER_BUTTON_SLOT_SIZE,
  CARD_ROW_HEIGHT,
  HERO_ZONE_HEIGHT,
  HOLE_CARDS_COL_PADDING_VERTICAL,
} from "./constants/tableLayout.constants";
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
  /** Single container setting row height (hole-cards container height). All three columns fill this. */
  mainRow: {
    height: HERO_ZONE_HEIGHT,
    gap: 8,
    alignItems: "stretch",
  },
  holeCardsCol: {
    paddingVertical: HOLE_CARDS_COL_PADDING_VERTICAL,
    gap: 8,
    alignSelf: "stretch",
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
    position: "relative",
    paddingRight: DEALER_BUTTON_SLOT_SIZE + 8,
    alignSelf: "stretch",
  },
  stackColContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  dealerSlotStack: {
    position: "absolute",
    top: 6,
    right: 6,
    width: DEALER_BUTTON_SLOT_SIZE,
    height: DEALER_BUTTON_SLOT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  heroAvatar: {
    width: 70,
    height: 70,
    borderRadius: 999,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  heroAvatarImage: {
    width: 70,
    height: 70,
    borderRadius: 999,
  },
  calcCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: DEALER_BUTTON_SLOT_SIZE,
    alignSelf: "stretch",
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
    marginTop: 8,
  },
  sittingOutBadgeInner: {
    backgroundColor: "hsla(0, 0%, 0%, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
