import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { STAGE_VIGNETTE } from "../tokens/stage.tokens";

/**
 * Soft vignette behind the felt for depth — translucent only, so the app's
 * custom background preset (color/image/gradient) stays visible through it.
 */
export function StageAtmosphere() {
  const vignetteStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          // Ellipse sized to the full box so the fade is gradual all the way
          // to the corners, instead of clamping to a flat edge color early.
          backgroundImage: `radial-gradient(ellipse 100% 100% at 50% 48%, ${STAGE_VIGNETTE.center} 0%, ${STAGE_VIGNETTE.edge} 100%)`,
        } as unknown as ViewStyle)
      : { backgroundColor: STAGE_VIGNETTE.edge };

  return (
    <View
      testID="stage-atmosphere"
      pointerEvents="none"
      collapsable={false}
      style={StyleSheet.absoluteFillObject}
    >
      <View
        testID="stage-atmosphere-vignette"
        collapsable={false}
        style={[StyleSheet.absoluteFillObject, vignetteStyle]}
      />
    </View>
  );
}
