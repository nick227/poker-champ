import { StyleSheet } from "react-native";
import { CONTAINER, BOARD, POT } from "./layout";

export const boardAreaStyles = StyleSheet.create({
  root: {
    width: "100%",
    flexDirection: "column",
  },
  inner: {
    marginVertical: CONTAINER.VERTICAL_MARGIN,
  },
  potContainer: {
    width: "100%",
    marginTop: BOARD.POT_MARGIN_TOP,
    paddingVertical: POT.PADDING_VERTICAL,
    paddingHorizontal: POT.PADDING_HORIZONTAL,
  },
});
