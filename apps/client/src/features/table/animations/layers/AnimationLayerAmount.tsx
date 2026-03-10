import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

type Props = {
  durationMs: number;
  delayMs?: number;
  amountText: string;
};

export function AnimationLayerAmount({ durationMs, delayMs = 0, amountText }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * 0.3,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durationMs * 0.35,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * 0.5,
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
        styles.wrap,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text} numberOfLines={1}>
        {amountText}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 56,
  },
  text: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    backgroundColor: "rgba(200, 60, 40, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
});
