import React, { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import type { WinFxScale } from "../../engine/winFxTier";

type Props = {
  intensity: SharedValue<number>;
  active: boolean;
  scale: WinFxScale | null;
  reducedMotion?: boolean;
};

/** Soft wash + light rays behind the cabinet; rays scale with win value. */
export function WinBackgroundFX({ intensity, active, scale, reducedMotion }: Props) {
  const spin = useSharedValue(0);
  const showRays = !reducedMotion && active && !!scale?.showRays;
  const rayCount = scale?.rayCount ?? 0;

  React.useEffect(() => {
    if (!showRays) {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [showRays, spin]);

  const washStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * 0.75,
  }));

  const rays = useMemo(() => Array.from({ length: Math.max(rayCount, 0) }, (_, i) => i), [rayCount]);

  if (!active) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.wash, washStyle]} />
      <Animated.View style={[styles.washCrimson, washStyle]} />
      {showRays
        ? rays.map((i) => <Ray key={i} index={i} total={rays.length} spin={spin} intensity={intensity} />)
        : null}
    </View>
  );
}

function Ray({
  index,
  total,
  spin,
  intensity,
}: {
  index: number;
  total: number;
  spin: SharedValue<number>;
  intensity: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const step = 180 / Math.max(total, 1);
    const deg = index * step + spin.value * 360;
    return {
      opacity: intensity.value * 0.4,
      transform: [{ rotate: `${deg}deg` }, { translateY: -140 }],
    };
  });
  return <Animated.View style={[styles.ray, style]} />;
}

const styles = {
  root: {
    position: "absolute" as const,
    top: -40,
    left: -40,
    right: -40,
    bottom: -40,
    zIndex: 0,
    overflow: "hidden" as const,
  },
  wash: {
    position: "absolute" as const,
    top: "10%" as const,
    left: "5%" as const,
    right: "5%" as const,
    bottom: "20%" as const,
    borderRadius: 999,
    backgroundColor: "rgba(255, 208, 80, 0.28)",
  },
  washCrimson: {
    position: "absolute" as const,
    top: "25%" as const,
    left: "15%" as const,
    right: "15%" as const,
    bottom: "30%" as const,
    borderRadius: 999,
    backgroundColor: "rgba(196, 40, 58, 0.22)",
  },
  ray: {
    position: "absolute" as const,
    top: "50%" as const,
    left: "50%" as const,
    width: 14,
    height: 280,
    marginLeft: -7,
    marginTop: -140,
    backgroundColor: casino.goldHi,
    opacity: 0.35,
    borderRadius: 8,
  },
};
