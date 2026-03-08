import { StyleSheet } from "react-native";
import { CONTAINER, STATUS, BUTTONS } from "./layout";

export const actionBarStyles = StyleSheet.create({
  root: {
    width: "100%",
    paddingHorizontal: CONTAINER.PADDING_HORIZONTAL,
  },
  inner: {
    padding: CONTAINER.PADDING,
    gap: CONTAINER.GAP,
  },
  statusRow: {
    height: STATUS.ROW_HEIGHT,
  },
  buttonsRow: {
    gap: BUTTONS.GAP,
    minHeight: BUTTONS.ROW_HEIGHT,
  },
  chipsRow: {
    gap: BUTTONS.CHIPS_GAP,
    minHeight: BUTTONS.CHIPS_ROW_HEIGHT,
  },
  betInputPlaceholder: {
    height: BUTTONS.BET_INPUT_ROW_HEIGHT,
    width: "100%",
  },
});
