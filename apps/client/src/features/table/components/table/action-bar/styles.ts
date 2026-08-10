import { StyleSheet } from "react-native";
import { CONTAINER, STATUS, BUTTONS } from "./layout";

export const actionBarStyles = StyleSheet.create({
  root: {
    width: "100%",
    paddingHorizontal: CONTAINER.PADDING_HORIZONTAL,
  },
  inner: {
    width: "100%",
    gap: CONTAINER.GAP,
    paddingTop: 4,
    paddingBottom: 2,
  },
  statusRow: {
    minHeight: STATUS.ROW_HEIGHT,
    justifyContent: "center",
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: BUTTONS.GAP,
    height: BUTTONS.ROW_HEIGHT,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: BUTTONS.CHIPS_GAP,
    minHeight: BUTTONS.CHIPS_ROW_HEIGHT,
  },
  betInputPlaceholder: {
    height: BUTTONS.BET_INPUT_ROW_HEIGHT,
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
  },
  wagerRow: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    height: BUTTONS.BET_INPUT_ROW_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3A4250",
    backgroundColor: "#12161C",
    paddingHorizontal: 8,
  },
  wagerInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  stepperBtn: {
    minWidth: 36,
    height: BUTTONS.BET_INPUT_ROW_HEIGHT - 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
});
