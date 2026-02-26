import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HERO_ZONE_HEIGHT,
} from "../constants/tableLayout.constants";

export function useTableLayoutHeights() {
  const insets = useSafeAreaInsets();

  return {
    insets,
    heroZoneHeight: HERO_ZONE_HEIGHT,
  };
}
