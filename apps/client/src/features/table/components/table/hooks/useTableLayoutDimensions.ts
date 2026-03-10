import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BOARD_AREA_HEIGHT,
  BOARD_AREA_HEIGHT_LANDSCAPE,
  DEALER_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
} from "../constants/table-layout.constants";
import { CARDS } from "../board-area/layout";

/** Scale factor when landscape (community cards grow); other heights scale with it. */
const LAYOUT_SCALE_LANDSCAPE = CARDS.SCALE_LANDSCAPE / CARDS.SCALE;

/** Computed layout dimensions (insets, band heights). Used by table-layout shell only; consumers use useTableLayoutHeight from context. */
export function useTableLayoutDimensions() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const boardAreaHeight = isLandscape ? BOARD_AREA_HEIGHT_LANDSCAPE : BOARD_AREA_HEIGHT;
  const gameAreaHeight = DEALER_BAR_HEIGHT + boardAreaHeight;
  const heroZoneHeight = isLandscape
    ? Math.round(HERO_ZONE_HEIGHT * LAYOUT_SCALE_LANDSCAPE)
    : HERO_ZONE_HEIGHT;
  const layoutScale = isLandscape ? LAYOUT_SCALE_LANDSCAPE : 1;

  return {
    insets,
    boardAreaHeight,
    gameAreaHeight,
    heroZoneHeight,
    layoutScale,
  };
}
