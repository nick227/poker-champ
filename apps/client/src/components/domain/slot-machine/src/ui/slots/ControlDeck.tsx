import React from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { casino } from "../../theme/casinoCabinet";
import { SpinButton } from "../components/SpinButton";

export function ControlDeck({
  betCents,
  busy,
  canSpin,
  reducedMotion,
  onSpin,
  spinStyle,
  spinFlashStyle,
}: {
  betCents: number;
  busy: boolean;
  canSpin: boolean;
  reducedMotion?: boolean;
  onSpin: () => void;
  spinStyle?: StyleProp<ViewStyle>;
  spinFlashStyle?: StyleProp<ViewStyle>;
}) {
  const size = useWindowDimensions().width < 520 ? 120 : 144;

  return (
    <View style={styles.rail}>
      <SpinButton
        betCents={betCents}
        spinning={busy}
        disabled={!canSpin}
        reducedMotion={reducedMotion}
        onPress={onSpin}
        animatedStyle={spinStyle}
        flashStyle={spinFlashStyle}
        size={size}
      />
    </View>
  );
}

const styles = {
  rail: {
    width: "100%" as const,
    flexShrink: 0,
    alignItems: "center" as const,
    backgroundColor: casino.reelFace,
    borderTopWidth: 2,
    borderTopColor: casino.goldMid,
    paddingTop: 10,
    paddingBottom: 12,
  },
};
