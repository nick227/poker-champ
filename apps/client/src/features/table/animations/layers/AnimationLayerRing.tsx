import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";
import { HOLD_AT_PEAK_FRACTION } from "../animationConstants";

const FALLBACK_RING_COLOR = "rgba(255, 215, 0, 0.9)";
const FALLBACK_RING_WIDTH = 4;
const DEFAULT_SCALE_RANGE: [number, number] = [0.8, 1.1];

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
  strokeWidth?: number;
  scaleRange?: [number, number];
};

function AnimationLayerRingInner({
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
    const opacityInFraction = 0.14;
    const scaleInFraction = 0.35;
    const opacityOutFraction = 0.45;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * opacityInFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(scale, {
          toValue: scaleTo,
          duration: durationMs * scaleInFraction,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        timeouts.push(
          setTimeout(() => {
            Animated.timing(opacity, {
              toValue: 0,
              duration: durationMs * opacityOutFraction,
              useNativeDriver: true,
              easing: EASING_OPACITY_OUT,
            }).start();
          }, durationMs * HOLD_AT_PEAK_FRACTION)
        );
      });
    };
    if (delayMs > 0) timeouts.push(setTimeout(run, delayMs));
    else run();
    return () => timeouts.forEach((t) => clearTimeout(t));
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
    margin: 10,
  },
});

export const AnimationLayerRing = memo(AnimationLayerRingInner);
