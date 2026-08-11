import React from "react";
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

export function Ray({
  index,
  total,
  spin,
  intensity,
  wild,
}: {
  index: number;
  total: number;
  spin: SharedValue<number>;
  intensity: SharedValue<number>;
  wild: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const step = 180 / Math.max(total, 1);
    const deg = index * step + spin.value * 360;
    return {
      opacity: intensity.value * (wild ? 0.95 : 0.75),
      transform: [{ rotate: `${deg}deg` }, { translateY: -280 }],
    };
  });
  return <Animated.View style={[styles.ray, wild ? styles.rayWild : null, style]} />;
}

export function Coin({
  index,
  intensity,
  fallMs,
  wild,
}: {
  index: number;
  intensity: SharedValue<number>;
  fallMs: number;
  wild: boolean;
}) {
  const progress = useSharedValue(0);
  const left = (index * 47) % 100;
  const size = (wild ? 16 : 13) + (index % 5) * 3;
  const drift = ((index % 11) - 5) * (wild ? 36 : 22);
  const delay = (index % 12) * Math.max(20, Math.round(fallMs / 50));
  const duration = Math.max(700, fallMs * 0.9 - delay * 0.15 + (index % 4) * 70);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration, easing: Easing.in(Easing.cubic) }), withTiming(0, { duration: 1 })),
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: intensity.value * Math.min(1, (1 - t) * 1.35),
      transform: [
        { translateY: -120 + t * (wild ? 900 : 700) },
        { translateX: drift * t },
        { rotate: `${t * (wild ? 720 : 480)}deg` },
        { scale: 1 + (1 - t) * 0.25 },
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
    >
      <View style={styles.coinCore} />
    </Animated.View>
  );
}

export function Spark({
  index,
  intensity,
  fallMs,
  wild,
  pool,
}: {
  index: number;
  intensity: SharedValue<number>;
  fallMs: number;
  wild: boolean;
  pool: number;
}) {
  const progress = useSharedValue(0);
  const angle = (index / pool) * Math.PI * 2;
  const dist = 180 + (index % 7) * 55;
  const size = 4 + (index % 4) * 2;
  const delay = (index % 8) * 40;
  const duration = Math.max(500, fallMs * 0.55 + (index % 5) * 60);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 1 })),
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const r = dist * t * (wild ? 1.45 : 1.15);
    return {
      opacity: intensity.value * (1 - t),
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r },
        { rotate: `${t * 180}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: size,
          height: size * (wild ? 3.2 : 2.4),
          marginLeft: -size / 2,
          marginTop: -size,
          backgroundColor: index % 2 === 0 ? casino.goldHi : "#fff",
        },
        style,
      ]}
    />
  );
}

const styles = {
  ray: {
    position: "absolute" as const,
    top: "50%" as const,
    left: "50%" as const,
    width: 28,
    height: 620,
    marginLeft: -14,
    marginTop: -310,
    backgroundColor: "#ffe566",
    borderRadius: 4,
  },
  rayWild: {
    width: 36,
    backgroundColor: "#fff2a8",
  },
  coin: {
    position: "absolute" as const,
    top: 0,
    backgroundColor: casino.goldMid,
    borderWidth: 3,
    borderColor: casino.goldHi,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  coinCore: {
    width: "42%" as const,
    height: "42%" as const,
    borderRadius: 99,
    backgroundColor: "#fff3b0",
  },
  spark: {
    position: "absolute" as const,
    top: "50%" as const,
    left: "50%" as const,
    borderRadius: 1,
  },
};
