import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

const RING_COLOR = "rgba(255, 215, 0, 0.9)";
const RING_WIDTH = 3;

type Props = {
  durationMs: number;
  delayMs?: number;
};

export function AnimationLayerRing({ durationMs, delayMs = 0 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * 0.2,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.1,
          duration: durationMs * 0.6,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * 0.4,
          useNativeDriver: true,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, opacity, scale]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        {
          opacity,
          transform: [{ scale }],
          borderWidth: RING_WIDTH,
          borderColor: RING_COLOR,
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
