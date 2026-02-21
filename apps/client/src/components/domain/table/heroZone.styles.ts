import { StyleSheet } from "react-native";
import {
  CALC_STRIP_HEIGHT,
  HERO_CARD_GAP,
  DEALER_BUTTON_SLOT_SIZE,
} from "./constants/components/heroZone.layout";

export const heroZoneStyles = StyleSheet.create({
  root: {
    flexDirection: "column",
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
