import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BOARD_AREA_HEIGHT,
  BOARD_AREA_HEIGHT_LANDSCAPE,
  DEALER_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
} from "../constants/table-layout.constants";
import { CARDS } from "../board-area/layout";
import { DESKTOP_WORKSPACE_MIN_WIDTH } from "@/hooks/useIsDesktopWorkspace";

/** Scale factor when landscape (community cards grow); other heights scale with it. */
const LAYOUT_SCALE_LANDSCAPE = CARDS.SCALE_LANDSCAPE / CARDS.SCALE;
/** Modest desktop bump — do not scale board with viewport height (blows up the stage). */
const LAYOUT_SCALE_DESKTOP = 1.2;

/** Computed layout dimensions (insets, band heights). Used by table-layout shell only; consumers use useTableLayoutHeight from context. */
export function useTableLayoutDimensions() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isDesktopWorkspace = width >= DESKTOP_WORKSPACE_MIN_WIDTH;

  let boardAreaHeight = isLandscape ? BOARD_AREA_HEIGHT_LANDSCAPE : BOARD_AREA_HEIGHT;
  let heroZoneHeight = isLandscape
    ? Math.round(HERO_ZONE_HEIGHT * LAYOUT_SCALE_LANDSCAPE)
    : HERO_ZONE_HEIGHT;
  let layoutScale = isLandscape ? LAYOUT_SCALE_LANDSCAPE : 1;

  if (isDesktopWorkspace) {
    layoutScale = Math.max(layoutScale, LAYOUT_SCALE_DESKTOP);
    boardAreaHeight = Math.round(BOARD_AREA_HEIGHT_LANDSCAPE * LAYOUT_SCALE_DESKTOP);
    heroZoneHeight = Math.round(HERO_ZONE_HEIGHT * LAYOUT_SCALE_DESKTOP);
  }

  const gameAreaHeight = DEALER_BAR_HEIGHT + boardAreaHeight;

  return {
    insets,
    boardAreaHeight,
    gameAreaHeight,
    heroZoneHeight,
    layoutScale,
    isDesktopWorkspace,
  };
}
