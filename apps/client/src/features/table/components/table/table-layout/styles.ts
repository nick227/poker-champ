/**
 * Vertical contract:
 * - Mobile: content-sized felt inside ScrollView.
 * - Desktop: stageHost flex:1 owns leftover height; felt paints via absoluteFill
 *   inside OpponentStrip (never flex:1 the felt as a document child).
 */
import { StyleSheet } from "react-native";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  ACTION_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
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
  opponentStripSection: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  desktopBody: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "column",
  },
  /** Owns leftover height between top bar and hero/action. */
  stageHost: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "column",
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
