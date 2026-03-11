import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT } from "../animationEasing";
import { HOLD_AT_PEAK_FRACTION } from "../animationConstants";

const FALLBACK_FLASH_COLOR = "rgba(255, 200, 100, 0.35)";
const RISE_FRACTION = 0.22;
const FALL_FRACTION = 0.72;

type Props = {
  durationMs: number;
  delayMs?: number;
  color?: string;
};

export function AnimationLayerFlash({ durationMs, delayMs = 0, color }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const bgColor = color ?? FALLBACK_FLASH_COLOR;

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs * RISE_FRACTION,
        useNativeDriver: true,
        easing: EASING_OPACITY_IN,
      }).start(() => {
        const holdMs = durationMs * HOLD_AT_PEAK_FRACTION;
        timeouts.push(
          setTimeout(() => {
            Animated.timing(opacity, {
              toValue: 0,
              duration: durationMs * FALL_FRACTION,
              useNativeDriver: true,
              easing: EASING_OPACITY_OUT,
            }).start();
          }, holdMs)
        );
      });
    };
    if (delayMs > 0) timeouts.push(setTimeout(run, delayMs));
    else run();
    return () => timeouts.forEach((t) => clearTimeout(t));
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
