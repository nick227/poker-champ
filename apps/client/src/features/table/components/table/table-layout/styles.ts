/**
 * Vertical contract: dark stage + compact HUD.
 * Seats live inside TableStage; no hero band; no ScrollView arena.
 * Table name/stakes live in WorkspaceStatusBar (site chrome).
 */
import { StyleSheet } from "react-native";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";

export const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: "transparent",
  },
  body: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "column",
    backgroundColor: "transparent",
  },
  stageHost: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: "transparent",
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
