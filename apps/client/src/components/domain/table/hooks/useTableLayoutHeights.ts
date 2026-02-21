import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  OPPONENT_STRIP_HEIGHT,
  HERO_ZONE_HEIGHT,
} from "../constants/tableLayout.constants";

export function useTableLayoutHeights() {
  const insets = useSafeAreaInsets();

  return {
    insets,
    opponentStripHeight: OPPONENT_STRIP_HEIGHT,
    heroZoneHeight: HERO_ZONE_HEIGHT,
  };
}
