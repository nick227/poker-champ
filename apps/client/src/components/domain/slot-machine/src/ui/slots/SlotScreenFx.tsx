import React, { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import type { WinFxScale } from "../../engine/winFxTier";

type Props = {
  intensity: SharedValue<number>;
  scale: WinFxScale | null;
  burstKey: number;
  reducedMotion?: boolean;
};

const POOL = 110;

/**
 * Full-bleed screen FX behind the cabinet.
 * glow = soft wash; shower/pandemonium = dense coin field + rays.
 */
export function SlotScreenFx({ intensity, scale, burstKey, reducedMotion }: Props) {
  const spin = useSharedValue(0);
  const active = scale != null && burstKey > 0;
  const mode = scale?.mode ?? "glow";
  const showRays = !reducedMotion && active && !!scale?.showRays;
  const coinCount = reducedMotion || !active ? 0 : scale?.coinCount ?? 0;
  const rayCount = scale?.rayCount ?? 0;
  const fallMs = scale?.holdMs ?? 800;

  React.useEffect(() => {
    if (!showRays) {
      spin.value = 0;
      return;
    }
    const speed = mode === "pandemonium" ? 2200 : 3800;
    spin.value = withRepeat(withTiming(1, { duration: speed, easing: Easing.linear }), -1, false);
  }, [showRays, mode, spin]);

  const washStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (mode === "glow" ? 0.9 : 0.7),
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: mode === "pandemonium" ? intensity.value * 0.35 : 0,
  }));

  const rays = useMemo(() => Array.from({ length: Math.max(rayCount, 0) }, (_, i) => i), [rayCount]);
  const coins = useMemo(() => Array.from({ length: POOL }, (_, i) => i), []);

  if (!active) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.wash, washStyle]} />
      <Animated.View style={[styles.washCrimson, washStyle]} />
      {mode === "pandemonium" ? <Animated.View style={[styles.strobe, flashStyle]} /> : null}
      {showRays
        ? rays.map((i) => <Ray key={i} index={i} total={rays.length} spin={spin} intensity={intensity} wild={mode === "pandemonium"} />)
        : null}
      {coins.slice(0, Math.min(POOL, coinCount)).map((i) => (
        <Coin key={`${burstKey}-${i}`} index={i} intensity={intensity} fallMs={fallMs} wild={mode === "pandemonium"} />
      ))}
    </View>
  );
}

function Ray({
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
      opacity: intensity.value * (wild ? 0.55 : 0.35),
      transform: [{ rotate: `${deg}deg` }, { translateY: -220 }],
    };
  });
  return <Animated.View style={[styles.ray, wild && styles.rayWild, style]} />;
}

function Coin({
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
  const left = 1 + ((index * 41) % 98);
  const size = (wild ? 10 : 8) + (index % 7) * 2;
  const drift = ((index % 9) - 4) * (wild ? 28 : 16);
  const delay = (index % 14) * Math.max(28, Math.round(fallMs / 40));
  const duration = Math.max(600, fallMs * 0.85 - delay * 0.2 + (index % 6) * 90);

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
        { translateY: -80 + t * (wild ? 720 : 560) },
        { translateX: drift * t },
        { rotate: `${t * (wild ? 540 : 360)}deg` },
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
    zIndex: 0,
    overflow: "hidden" as const,
  },
  wash: {
    position: "absolute" as const,
    top: "-10%" as const,
    left: "-10%" as const,
    right: "-10%" as const,
    bottom: "-10%" as const,
    borderRadius: 999,
    backgroundColor: "rgba(255, 208, 80, 0.22)",
  },
  washCrimson: {
    position: "absolute" as const,
    top: "15%" as const,
    left: "10%" as const,
    right: "10%" as const,
    bottom: "15%" as const,
    borderRadius: 999,
    backgroundColor: "rgba(196, 40, 58, 0.18)",
  },
  strobe: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 244, 180, 0.25)",
  },
  ray: {
    position: "absolute" as const,
    top: "50%" as const,
    left: "50%" as const,
    width: 18,
    height: 460,
    marginLeft: -9,
    marginTop: -230,
    backgroundColor: casino.goldHi,
    opacity: 0.3,
    borderRadius: 10,
  },
  rayWild: {
    width: 22,
    backgroundColor: "#fff3b0",
  },
  coin: {
    position: "absolute" as const,
    top: 0,
    backgroundColor: casino.gold,
    borderWidth: 1.5,
    borderColor: casino.goldHi,
  },
};
