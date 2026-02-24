import { StyleSheet } from "react-native";
import {
  CALC_STRIP_HEIGHT,
  HERO_CARD_GAP,
  DEALER_BUTTON_SLOT_SIZE,
} from "./constants/components/heroZone.layout";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";
import { ACTIVE_TILE_BORDER } from "./constants/style/tableColors";

export const heroZoneStyles = StyleSheet.create({
  root: {
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
        color: "hsla(158, 52%, 42%, 0.35)",
      },
    ] as const,
    elevation: 6,
  },
  calcStrip: {
    height: CALC_STRIP_HEIGHT,
  },
  mainRow: {
    gap: 20,
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
    height: 72,
    gap: HERO_CARD_GAP,
    alignItems: "center",
    justifyContent: "center",
  },
  stackCol: {
    gap: 4,
  },
  dealerSlot: {
    width: DEALER_BUTTON_SLOT_SIZE,
    height: DEALER_BUTTON_SLOT_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
});
