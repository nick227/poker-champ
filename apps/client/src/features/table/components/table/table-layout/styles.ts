/**
 * Vertical contract:
 * - Mobile: fixed-height bands; ScrollView absorbs overflow.
 * - Desktop workspace: gameArena flex:1 so the felt stage fills space between
 *   top bar and action bar (share strip / hero / action stay fixed).
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
  /** Desktop: fills remaining height under the top bar. */
  desktopBody: {
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
  /** Desktop felt + seats: consume leftover vertical space. */
  gameArenaFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
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
