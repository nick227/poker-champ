import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

const FLASH_COLOR = "rgba(255, 200, 100, 0.35)";

type Props = {
  durationMs: number;
  delayMs?: number;
};

export function AnimationLayerFlash({ durationMs, delayMs = 0 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * 0.35,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * 0.65,
          useNativeDriver: true,
        }),
      ]).start();
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.flash, { opacity }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  flash: {
    backgroundColor: FLASH_COLOR,
  },
});
