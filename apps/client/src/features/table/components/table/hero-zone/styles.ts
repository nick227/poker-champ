import { StyleSheet } from "react-native";
import { CONTAINER, CARDS, DEALER_BUTTON, TEXT } from "./layout";
import { ACTIVE_TILE_BORDER } from "../tokens/colors.tokens";

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
  /** Height set by component (zoneHeight). All three columns fill this. */
  mainRow: {
    gap: CONTAINER.ROW_GAP,
    alignItems: "stretch",
  },
  holeCardsCol: {
    paddingVertical: CARDS.HOLE_CARDS_COL_PADDING_VERTICAL,
    gap: CONTAINER.ROW_GAP,
    alignSelf: "stretch",
  },
  holeCardsHeader: {
    gap: 6,
    minHeight: TEXT.HEADER_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRow: {
    height: CARDS.ROW_HEIGHT,
    gap: CARDS.GAP,
    alignItems: "center",
    justifyContent: "center",
  },
  calcCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: DEALER_BUTTON.SLOT_SIZE,
    alignSelf: "stretch",
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
