import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";

const FALLBACK_GLOW_COLOR = "rgba(255, 180, 80, 0.35)";
const GLOW_SIZE = 220;
const SCALE_FROM = 0.3;
const SCALE_TO = 1.2;

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
  /**
   * [min, max] opacity range to animate between (instead of the default 0→1→0 envelope).
   * Atmosphere/background presets use this to tune "soft" vs "punchy" without ever going
   * fully transparent or fully opaque. When omitted, falls back to the full 0→1→0 range.
   */
  opacity?: [number, number];
};

function AnimationLayerRadialGlowInner({
  durationMs,
  delayMs = 0,
  color,
  opacity,
}: Props) {
  const [opacityFrom, opacityTo] = opacity ?? [0, 1];
  const opacityAnim = useRef(new Animated.Value(opacityFrom)).current;
  const scale = useRef(new Animated.Value(SCALE_FROM)).current;
  const glowColor = color ?? FALLBACK_GLOW_COLOR;

  useEffect(() => {
    const opacityInFraction = 0.2;
    const scaleInFraction = 0.4;
    const opacityOutFraction = 0.5;
    const start = () => {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: opacityTo,
          duration: durationMs * opacityInFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(scale, {
          toValue: SCALE_TO,
          duration: durationMs * scaleInFraction,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.timing(opacityAnim, {
          toValue: opacityFrom,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_OUT,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(start, delayMs) : start();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacityAnim, scale, opacityFrom, opacityTo]);

  const half = GLOW_SIZE / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.glow,
          {
            width: GLOW_SIZE,
            height: GLOW_SIZE,
            marginLeft: -half,
            marginTop: -half,
            backgroundColor: glowColor,
            opacity: opacityAnim,
            transform: [{ scale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    left: "50%",
    top: "50%",
    borderRadius: 9999,
  },
});

export const AnimationLayerRadialGlow = memo(AnimationLayerRadialGlowInner);
