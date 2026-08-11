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

type Props = {
  intensity: SharedValue<number>;
  coinCount: number;
  burstKey: number;
  fallMs: number;
  reducedMotion?: boolean;
};

const POOL = 48;

/** Falling gold discs — count and fall time scale with win value. */
export function CoinRain({ intensity, coinCount, burstKey, fallMs, reducedMotion }: Props) {
  const coins = useMemo(() => Array.from({ length: POOL }, (_, i) => i), []);
  if (reducedMotion || coinCount <= 0 || burstKey <= 0) return null;

  const activeCount = Math.min(POOL, coinCount);

  return (
    <View style={styles.root} pointerEvents="none">
      {coins.slice(0, activeCount).map((i) => (
        <Coin key={`${burstKey}-${i}`} index={i} intensity={intensity} fallMs={fallMs} />
      ))}
    </View>
  );
}

function Coin({
  index,
  intensity,
  fallMs,
}: {
  index: number;
  intensity: SharedValue<number>;
  fallMs: number;
}) {
  const progress = useSharedValue(0);
  const left = 4 + ((index * 37) % 92);
  const size = 8 + (index % 6) * 2;
  const drift = ((index % 7) - 3) * 14;
  const delay = (index % 10) * Math.max(35, Math.round(fallMs / 28));
  const duration = Math.max(500, fallMs - delay * 0.35 + (index % 5) * 80);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 1 }),
      ),
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: intensity.value * (1 - t) * 0.95,
      transform: [
        { translateY: -40 + t * 480 },
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
