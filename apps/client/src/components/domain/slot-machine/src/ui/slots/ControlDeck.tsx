import React from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { MachineReadout } from "../../engine/display";
import { ResultMeter } from "./ResultMeter";
import { SpinButton } from "../components/SpinButton";

export function ControlDeck({
  betCents,
  busy,
  canSpin,
  readout,
  reducedMotion,
  onSpin,
  spinStyle,
  spinFlashStyle,
  resultStyle,
}: {
  betCents: number;
  busy: boolean;
  canSpin: boolean;
  readout: MachineReadout;
  reducedMotion?: boolean;
  onSpin: () => void;
  spinStyle?: StyleProp<ViewStyle>;
  spinFlashStyle?: StyleProp<ViewStyle>;
  resultStyle?: StyleProp<ViewStyle>;
}) {
  const size = useWindowDimensions().width < 520 ? 128 : 152;

  return (
    <View style={styles.deck}>
      <ResultMeter readout={readout} animatedStyle={resultStyle} />
      <View style={styles.hub}>
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
    </View>
  );
}

const styles = {
  deck: {
    width: "100%" as const,
    flexShrink: 0,
    alignItems: "center" as const,
    paddingBottom: 4,
  },
  hub: {
    alignItems: "center" as const,
  },
};
