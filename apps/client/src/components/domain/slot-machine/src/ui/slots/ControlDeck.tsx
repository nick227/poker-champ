import React from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { BetTier } from "../../hooks/useBetTier";
import { BetStepper, MaxBetButton } from "../components/BetControls";
import { SpinButton } from "../components/SpinButton";

export function ControlDeck({
  tier,
  betCents,
  busy,
  canSpin,
  reducedMotion,
  onSpin,
  onTier,
  onMax,
  spinStyle,
  spinFlashStyle,
}: {
  tier: BetTier;
  betCents: number;
  busy: boolean;
  canSpin: boolean;
  reducedMotion?: boolean;
  onSpin: () => void;
  onTier: (tier: BetTier) => void;
  onMax: () => void;
  spinStyle?: StyleProp<ViewStyle>;
  spinFlashStyle?: StyleProp<ViewStyle>;
}) {
  const size = useWindowDimensions().width < 520 ? 128 : 152;

  return (
    <View style={styles.deck}>
      <View style={styles.side}>
        <BetStepper tier={tier} betCents={betCents} disabled={busy} onTier={onTier} />
      </View>
      <SpinButton
        spinning={busy}
        disabled={!canSpin && !busy}
        reducedMotion={reducedMotion}
        onPress={onSpin}
        animatedStyle={spinStyle}
        flashStyle={spinFlashStyle}
        size={size}
      />
      <View style={[styles.side, styles.sideEnd]}>
        <MaxBetButton disabled={busy} onPress={onMax} />
      </View>
    </View>
  );
}

const styles = {
  deck: {
    width: "100%" as const,
    flexShrink: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 4,
  },
  side: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center" as const,
  },
  sideEnd: {
    alignItems: "flex-end" as const,
  },
};
