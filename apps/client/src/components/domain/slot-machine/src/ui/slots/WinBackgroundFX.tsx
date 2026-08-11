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
import type { WinFxTier } from "../../engine/winFxTier";

type Props = {
  intensity: SharedValue<number>;
  tier: WinFxTier | null;
  reducedMotion?: boolean;
};

/** Soft wash + light rays behind the cabinet. Rays only for big+. */
export function WinBackgroundFX({ intensity, tier, reducedMotion }: Props) {
  const spin = useSharedValue(0);

  React.useEffect(() => {
    if (reducedMotion || !tier || tier === "small") {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [tier, reducedMotion, spin]);

  const washMul = tier === "small" ? 0.35 : 0.7;
  const washStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * washMul,
  }));

  const rays = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  const showRays = !reducedMotion && tier != null && tier !== "small";

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.wash, washStyle]} />
      <Animated.View style={[styles.washCrimson, washStyle]} />
      {showRays
        ? rays.map((i) => <Ray key={i} index={i} spin={spin} intensity={intensity} />)
        : null}
    </View>
  );
}

function Ray({
  index,
  spin,
  intensity,
}: {
  index: number;
  spin: SharedValue<number>;
  intensity: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const deg = index * 22.5 + spin.value * 360;
    return {
      opacity: intensity.value * 0.45,
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
