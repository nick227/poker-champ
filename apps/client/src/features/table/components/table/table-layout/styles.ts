/**
 * Vertical contract: top bar + flex stage (felt/seats) + compact HUD.
 * Seats live inside TableStage; no hero band; no ScrollView arena.
 */
import { StyleSheet } from "react-native";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  ACTION_BAR_HEIGHT,
  DEALER_BAR_HEIGHT,
} from "../constants/table-layout.constants";
import { TABLE_SPACING } from "../tokens/spacing.tokens";

export const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    alignItems: "stretch",
  },
  titleSection: {
    width: "100%",
    height: LAYOUT_GAME_TOP_BAR_HEIGHT,
    minHeight: LAYOUT_GAME_TOP_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "column",
  },
  stageHost: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  dealerBar: {
    maxHeight: DEALER_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  /** Compact HUD: grows with content up to ACTION_BAR_HEIGHT. */
  actionHudSection: {
    width: "100%",
    minHeight: 56,
    maxHeight: ACTION_BAR_HEIGHT + 24,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: TABLE_SPACING.edge,
  },
});
