import React, { useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import type { WinFxScale } from "../../engine/winFxTier";
import { Coin, Ray, Spark } from "./SlotScreenFxParticles";

type Props = {
  intensity: SharedValue<number>;
  scale: WinFxScale | null;
  burstKey: number;
  reducedMotion?: boolean;
};

const COIN_POOL = 140;
const SPARK_POOL = 48;

/** Arcade-loud full-bleed FX: hard blasts, fat rays, chunky coins — not soft web washes. */
export function SlotScreenFx({ intensity, scale, burstKey, reducedMotion }: Props) {
  const spin = useSharedValue(0);
  const flicker = useSharedValue(0);
  const active = scale != null && burstKey > 0;
  const mode = scale?.mode ?? "glow";
  const wild = mode === "pandemonium";
  const showRays = !reducedMotion && active && !!scale?.showRays;
  const coinCount = reducedMotion || !active ? 0 : scale?.coinCount ?? 0;
  const sparkCount = reducedMotion || !active ? 0 : scale?.sparkCount ?? 0;
  const rayCount = scale?.rayCount ?? 0;
  const fallMs = scale?.holdMs ?? 900;

  React.useEffect(() => {
    if (!active) {
      spin.value = 0;
      flicker.value = 0;
      return;
    }
    flicker.value = withRepeat(
      withSequence(withTiming(1, { duration: wild ? 70 : 120 }), withTiming(0.35, { duration: wild ? 90 : 160 })),
      -1,
      false,
    );
    if (!showRays) return;
    spin.value = withRepeat(withTiming(1, { duration: wild ? 1600 : 2800, easing: Easing.linear }), -1, false);
  }, [active, showRays, wild, spin, flicker]);

  const blastStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (0.55 + flicker.value * 0.45),
  }));
  const rimStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (0.7 + flicker.value * 0.3),
  }));
  const strobeStyle = useAnimatedStyle(() => ({
    opacity: wild ? intensity.value * flicker.value * 0.85 : intensity.value * flicker.value * 0.25,
  }));

  const rays = useMemo(() => Array.from({ length: Math.max(rayCount, 0) }, (_, i) => i), [rayCount]);
  const coins = useMemo(() => Array.from({ length: COIN_POOL }, (_, i) => i), []);
  const sparks = useMemo(() => Array.from({ length: SPARK_POOL }, (_, i) => i), []);

  if (!active) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.blastGold, blastStyle]} />
      <Animated.View style={[styles.blastRed, blastStyle]} />
      <Animated.View style={[styles.strobe, strobeStyle]} />
      <Animated.View style={[styles.rimTop, rimStyle]} />
      <Animated.View style={[styles.rimBottom, rimStyle]} />
      <Animated.View style={[styles.rimLeft, rimStyle]} />
      <Animated.View style={[styles.rimRight, rimStyle]} />

      {showRays
        ? rays.map((i) => (
            <Ray key={i} index={i} total={rays.length} spin={spin} intensity={intensity} wild={wild} />
          ))
        : null}

      {sparks.slice(0, Math.min(SPARK_POOL, sparkCount)).map((i) => (
        <Spark key={`s-${burstKey}-${i}`} index={i} intensity={intensity} fallMs={fallMs} wild={wild} pool={SPARK_POOL} />
      ))}

      {coins.slice(0, Math.min(COIN_POOL, coinCount)).map((i) => (
        <Coin key={`c-${burstKey}-${i}`} index={i} intensity={intensity} fallMs={fallMs} wild={wild} />
      ))}
    </View>
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
  blastGold: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 190, 40, 0.55)",
  },
  blastRed: {
    position: "absolute" as const,
    top: "8%" as const,
    left: "6%" as const,
    right: "6%" as const,
    bottom: "8%" as const,
    backgroundColor: "rgba(220, 20, 40, 0.42)",
  },
  strobe: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff8c8",
  },
  rimTop: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: casino.goldHi,
  },
  rimBottom: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: casino.gold,
  },
  rimLeft: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    left: 0,
    width: 18,
    backgroundColor: casino.crimsonHi,
  },
  rimRight: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    right: 0,
    width: 18,
    backgroundColor: casino.crimsonHi,
  },
};
