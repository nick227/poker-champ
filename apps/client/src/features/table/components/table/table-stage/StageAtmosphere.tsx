import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { STAGE_VOID_BG, STAGE_VIGNETTE } from "../tokens/stage.tokens";

/**
 * Dark theater behind the felt — kills leftover app-panel / page background feel.
 */
export function StageAtmosphere() {
  const vignetteStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 48%, ${STAGE_VIGNETTE.center} 0%, ${STAGE_VIGNETTE.edge} 100%)`,
        } as unknown as ViewStyle)
      : { backgroundColor: "hsla(220, 30%, 2%, 0.45)" };

  return (
    <View
      testID="stage-atmosphere"
      pointerEvents="none"
      collapsable={false}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: STAGE_VOID_BG }]}
    >
      <View
        testID="stage-atmosphere-vignette"
        collapsable={false}
        style={[StyleSheet.absoluteFillObject, vignetteStyle]}
      />
    </View>
  );
}
