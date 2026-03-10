import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

const SIZE_MAP = {
  small: 22,
  medium: 28,
  large: 36,
  xlarge: 48,
} as const;

type Props = {
  durationMs: number;
  delayMs?: number;
  text: string;
  size?: keyof typeof SIZE_MAP;
  glow?: boolean;
};

export function AnimationLayerTypography({
  durationMs,
  delayMs = 0,
  text,
  size = "large",
  glow = false,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * 0.25,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durationMs * 0.4,
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

  const fontSize = SIZE_MAP[size] ?? SIZE_MAP.large;
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
      <Text
        style={[
          styles.text,
          { fontSize },
          glow ? styles.glow : undefined,
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(255, 100, 50, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  glow: {
    textShadowRadius: 12,
    textShadowColor: "rgba(255, 180, 80, 1)",
  },
});
