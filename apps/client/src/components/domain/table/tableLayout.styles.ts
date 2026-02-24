/**
 * Vertical contract: arena is fixed-height bands only.
 * Only mainContent (outer) may flex (flexGrow: 1) to absorb extra space.
 * Nothing in DealerBar → OpponentStrip → Felt → Hero → ActionBar uses flex: 1.
 */
import { StyleSheet } from "react-native";
import {
  LAYOUT_TITLE_HEIGHT,
  LAYOUT_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  ACTION_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
  DEALER_BAR_HEIGHT,
} from "./constants/tableLayout.constants";
import { COMMUNITY_BOARD_HEIGHT } from "./constants/components/communityBoard.layout";

export const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    alignItems: "stretch",
  },
  titleSection: {
    width: "100%",
    height: LAYOUT_TITLE_HEIGHT,
    minHeight: LAYOUT_TITLE_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  topBarSection: {
    width: "100%",
    height: LAYOUT_TOP_BAR_HEIGHT,
    minHeight: LAYOUT_TOP_BAR_HEIGHT,
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
    minHeight: DEALER_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  feltArea: {
    width: "100%",
    height: COMMUNITY_BOARD_HEIGHT,
    minHeight: COMMUNITY_BOARD_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  heroSection: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  actionBarSection: {
    width: "100%",
    height: ACTION_BAR_HEIGHT,
    minHeight: ACTION_BAR_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
});
