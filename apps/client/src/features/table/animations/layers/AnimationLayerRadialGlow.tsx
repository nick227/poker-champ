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
  /** Static opacity multiplier (0–1); atmosphere presets use this. */
  opacity?: number;
};

function AnimationLayerRadialGlowInner({
  durationMs,
  delayMs = 0,
  color,
  opacity: opacityProp,
}: Props) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(SCALE_FROM)).current;
  const glowColor = color ?? FALLBACK_GLOW_COLOR;

  useEffect(() => {
    const opacityInFraction = 0.2;
    const scaleInFraction = 0.4;
    const opacityOutFraction = 0.5;
    const start = () => {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
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
          toValue: 0,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: true,
          easing: EASING_OPACITY_OUT,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(start, delayMs) : start();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacityAnim, scale]);

  const half = GLOW_SIZE / 2;
  return (
    <View style={[StyleSheet.absoluteFill, opacityProp != null && { opacity: opacityProp }]} pointerEvents="none">
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
