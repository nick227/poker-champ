import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

const FALLBACK_FLASH_COLOR = "rgba(255, 200, 100, 0.35)";

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
};

export function AnimationLayerFlash({ durationMs, delayMs = 0, color }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const bgColor = color ?? FALLBACK_FLASH_COLOR;

  useEffect(() => {
    const riseFraction = 0.25;
    const fallFraction = 0.75;
    const run = () => {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * riseFraction,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * fallFraction,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }),
      ]).start();
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.flash, { opacity, backgroundColor: bgColor }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  flash: {},
});
