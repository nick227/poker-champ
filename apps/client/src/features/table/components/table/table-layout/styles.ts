/**
 * Vertical contract: thin top overlay + dark stage + compact HUD.
 * Seats live inside TableStage; no hero band; no ScrollView arena.
 */
import { StyleSheet } from "react-native";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  ACTION_BAR_HEIGHT,
} from "../constants/table-layout.constants";
import { STAGE_VOID_BG } from "../tokens/stage.tokens";

export const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: STAGE_VOID_BG,
  },
  titleSection: {
    width: "100%",
    height: LAYOUT_GAME_TOP_BAR_HEIGHT,
    minHeight: LAYOUT_GAME_TOP_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "transparent",
    zIndex: 4,
  },
  body: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "column",
    backgroundColor: STAGE_VOID_BG,
  },
  stageHost: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: STAGE_VOID_BG,
    // Let south nameplates paint above the host edge; HUD sits below in layout.
    overflow: "visible",
  },
  /** Compact HUD: fixed band so stage/table never jump when actions mount/unmount. */
  actionHudSection: {
    width: "100%",
    height: ACTION_BAR_HEIGHT,
    minHeight: ACTION_BAR_HEIGHT,
    maxHeight: ACTION_BAR_HEIGHT + 24,
    flexGrow: 0,
    flexShrink: 0,
    // Horizontal padding lives on ActionBar — avoid double inset.
    paddingHorizontal: 0,
    paddingTop: 4,
    backgroundColor: "transparent",
    justifyContent: "center",
  },
});
