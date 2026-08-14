import React from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { BetTier } from "../../hooks/useBetTier";
import { BetStepper, DeckActions } from "../components/BetControls";
import { SpinButton } from "../components/SpinButton";

export function ControlDeck({
  tier,
  betCents,
  busy,
  autoPlay,
  canSpin,
  reducedMotion,
  onSpin,
  onToggleAuto,
  onTier,
  onMax,
  spinStyle,
  spinFlashStyle,
}: {
  tier: BetTier;
  betCents: number;
  busy: boolean;
  autoPlay: boolean;
  canSpin: boolean;
  reducedMotion?: boolean;
  onSpin: () => void;
  onToggleAuto: () => void;
  onTier: (tier: BetTier) => void;
  onMax: () => void;
  spinStyle?: StyleProp<ViewStyle>;
  spinFlashStyle?: StyleProp<ViewStyle>;
}) {
  const size = useWindowDimensions().width < 520 ? 96 : 120;

  return (
    <View style={[styles.deck, { height: size }]}>
      <View style={styles.side}>
        <BetStepper tier={tier} betCents={betCents} disabled={busy} onTier={onTier} />
      </View>
      <View style={[styles.hub, { width: size }]}>
        <SpinButton
          spinning={busy}
          autoPlay={autoPlay}
          disabled={!canSpin && !busy}
          reducedMotion={reducedMotion}
          onPress={onSpin}
          onLongPress={onToggleAuto}
          animatedStyle={spinStyle}
          flashStyle={spinFlashStyle}
          size={size}
        />
      </View>
      <View style={styles.side}>
        <DeckActions autoPlay={autoPlay} disabled={busy} onMax={onMax} onToggleAuto={onToggleAuto} />
      </View>
    </View>
  );
}

const styles = {
  deck: {
    width: "100%" as const,
    flexShrink: 0,
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    gap: 10,
  },
  side: {
    flex: 1,
    minWidth: 0,
  },
  hub: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
};
