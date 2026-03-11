import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

const FALLBACK_RING_COLOR = "rgba(255, 215, 0, 0.9)";
const FALLBACK_RING_WIDTH = 3;
const DEFAULT_SCALE_RANGE: [number, number] = [0.8, 1.1];

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
  strokeWidth?: number;
  scaleRange?: [number, number];
};

export function AnimationLayerRing({
  durationMs,
  delayMs = 0,
  color,
  strokeWidth = FALLBACK_RING_WIDTH,
  scaleRange = DEFAULT_SCALE_RANGE,
}: Props) {
  const [scaleFrom, scaleTo] = scaleRange;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(scaleFrom)).current;
  const borderColor = color ?? FALLBACK_RING_COLOR;

  useEffect(() => {
    const opacityInFraction = 0.15;
    const scaleInFraction = 0.4;
    const opacityOutFraction = 0.45;
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * opacityInFraction,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(scale, {
          toValue: scaleTo,
          duration: durationMs * scaleInFraction,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity, scale, scaleFrom, scaleTo]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        {
          opacity,
          transform: [{ scale }],
          borderWidth: strokeWidth,
          borderColor,
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    borderRadius: 9999,
    margin: 12,
  },
});
