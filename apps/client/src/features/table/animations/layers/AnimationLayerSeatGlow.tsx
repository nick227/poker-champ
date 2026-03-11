import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { EASING_OPACITY_IN_SOFT, EASING_OPACITY_OUT } from "../animationEasing";

const FALLBACK_GLOW_COLOR = "rgba(255, 200, 100, 0.6)";
const BORDER_WIDTH = 3;
const RISE_FRACTION = 0.25;
const FALL_FRACTION = 0.5;

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
};

function AnimationLayerSeatGlowInner({ durationMs, delayMs = 0, color }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const glowColor = color ?? FALLBACK_GLOW_COLOR;

  useEffect(() => {
    const run = () =>
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * RISE_FRACTION,
          useNativeDriver: true,
          easing: EASING_OPACITY_IN_SOFT,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * FALL_FRACTION,
          useNativeDriver: true,
          easing: EASING_OPACITY_OUT,
        }),
      ]).start();
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.glow, { borderColor: glowColor, opacity }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    borderWidth: BORDER_WIDTH,
    borderRadius: 12,
  },
});

export const AnimationLayerSeatGlow = memo(AnimationLayerSeatGlowInner);
