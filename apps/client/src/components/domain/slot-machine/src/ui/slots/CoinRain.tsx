import React, { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import type { WinFxTier } from "../../engine/winFxTier";

type Props = {
  intensity: SharedValue<number>;
  tier: WinFxTier | null;
  reducedMotion?: boolean;
};

const POOL = 24;

/** Falling gold discs for Big / Mega / Jackpot presentations. */
export function CoinRain({ intensity, tier, reducedMotion }: Props) {
  const coins = useMemo(() => Array.from({ length: POOL }, (_, i) => i), []);
  if (reducedMotion || !tier || tier === "small") return null;

  const activeCount = tier === "jackpot" ? POOL : tier === "mega" ? 18 : 12;

  return (
    <View style={styles.root} pointerEvents="none">
      {coins.slice(0, activeCount).map((i) => (
        <Coin key={`${tier}-${i}`} index={i} intensity={intensity} />
      ))}
    </View>
  );
}

function Coin({ index, intensity }: { index: number; intensity: SharedValue<number> }) {
  const progress = useSharedValue(0);
  const left = 6 + ((index * 37) % 88);
  const size = 10 + (index % 5) * 2;
  const drift = ((index % 7) - 3) * 12;
  const delay = (index % 8) * 70;

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 1400 + (index % 5) * 120, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 1 }),
      ),
    );
  }, [delay, index, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: intensity.value * (1 - t) * 0.95,
      transform: [
        { translateY: -40 + t * 420 },
        { translateX: drift * t },
        { rotate: `${t * 360}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.coin,
        { left: `${left}%` as `${number}%`, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

const styles = {
  root: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
    overflow: "hidden" as const,
  },
  coin: {
    position: "absolute" as const,
    top: 0,
    backgroundColor: casino.gold,
    borderWidth: 1.5,
    borderColor: casino.goldHi,
  },
};
