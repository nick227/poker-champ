import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { formatCents } from "../../engine/format";
import { winFxLabel, type WinFxTier } from "../../engine/winFxTier";
import { casino } from "../../theme/casinoCabinet";

export type WinPresentation = {
  tier: Exclude<WinFxTier, "small">;
  winCents: number;
};

type Props = {
  presentation: WinPresentation | null;
  reducedMotion?: boolean;
  onDone?: () => void;
};

/** Named Big / Mega / Jackpot overlay with paced count-up. */
export function WinPresentationOverlay({ presentation, reducedMotion, onDone }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const [displayCents, setDisplayCents] = useState(0);

  useEffect(() => {
    if (!presentation) {
      opacity.value = 0;
      scale.value = 0.85;
      setDisplayCents(0);
      return;
    }

    const duration = presentation.tier === "jackpot" ? 2200 : presentation.tier === "mega" ? 1600 : 1100;

    opacity.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: duration - 360 }),
      withTiming(0, { duration: 180 }),
    );
    scale.value = withSequence(
      withTiming(1.08, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 160 }),
      withTiming(1, { duration: duration - 560 }),
      withTiming(0.92, { duration: 180 }),
    );

    if (reducedMotion) {
      setDisplayCents(presentation.winCents);
      const t = setTimeout(() => onDone?.(), Math.min(duration, 600));
      return () => clearTimeout(t);
    }

    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / (duration * 0.75));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayCents(Math.round(presentation.winCents * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplayCents(presentation.winCents);
      }
    };
    frame = requestAnimationFrame(tick);
    const doneTimer = setTimeout(() => onDone?.(), duration);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(doneTimer);
    };
  }, [presentation, reducedMotion, onDone, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!presentation) return null;
  const label = winFxLabel(presentation.tier);
  if (!label) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.card, style]}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.amount}>{formatCents(displayCents)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = {
  wrap: {
    position: "absolute" as const,
    top: "28%" as const,
    left: 16,
    right: 16,
    zIndex: 12,
    alignItems: "center" as const,
  },
  card: {
    minWidth: "70%" as const,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "rgba(10, 4, 6, 0.88)",
    borderWidth: 3,
    borderColor: casino.goldHi,
    alignItems: "center" as const,
    gap: 4,
  },
  label: {
    fontSize: 22,
    fontWeight: "900" as const,
    letterSpacing: 3,
    color: casino.goldHi,
  },
  amount: {
    fontSize: 32,
    fontWeight: "900" as const,
    letterSpacing: 1,
    color: "#fff6d0",
  },
};
