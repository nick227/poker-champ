/**
 * Vertical contract: arena is fixed-height bands only.
 * Only mainContent (outer) may flex (flexGrow: 1) to absorb extra space.
 * Nothing in DealerBar → OpponentStrip → Felt → Hero → ActionBar uses flex: 1.
 */
import { StyleSheet } from "react-native";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  ACTION_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
  DEALER_BAR_HEIGHT,
  BOARD_AREA_HEIGHT,
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
  opponentStripSection: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  mainContent: {
    width: "100%",
    flexGrow: 1,
    flexShrink: 0,
    minHeight: GAME_AREA_HEIGHT + HERO_ZONE_HEIGHT,
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  gameArea: {
    width: "100%",
    height: GAME_AREA_HEIGHT,
    minHeight: GAME_AREA_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "column",
  },
  dealerBar: {
    height: DEALER_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  feltArea: {
    width: "100%",
    height: BOARD_AREA_HEIGHT,
    minHeight: BOARD_AREA_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: TABLE_SPACING.edge,
  },
  heroSection: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: TABLE_SPACING.edge,
  },
  actionBarSection: {
    width: "100%",
    height: ACTION_BAR_HEIGHT,
    minHeight: ACTION_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
});
