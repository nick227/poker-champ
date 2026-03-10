import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

const SIZE_MAP = {
  small: 22,
  medium: 28,
  large: 36,
  xlarge: 48,
} as const;

type TextRole = "headline" | "amount";
type TextSize = keyof typeof SIZE_MAP;

type Props = {
  durationMs: number;
  delayMs?: number;
  role: TextRole;
  text: string;
  size?: TextSize;
  glow?: boolean;
};

export function TextLayer({
  durationMs,
  delayMs = 0,
  role,
  text,
  size = "large",
  glow = false,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(role === "amount" ? 0.8 : 0.5)).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * (role === "amount" ? 0.3 : 0.25),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durationMs * (role === "amount" ? 0.35 : 0.4),
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
  }, [durationMs, delayMs, role, opacity, scale]);

  const fontSize = SIZE_MAP[size] ?? SIZE_MAP.large;
  const isHeadline = role === "headline";

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.wrap,
        isHeadline ? undefined : styles.amountWrap,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
      pointerEvents="none"
    >
      <Text
        style={[
          isHeadline ? styles.headline : styles.amount,
          { fontSize: isHeadline ? fontSize : 24 },
          isHeadline && glow ? styles.glow : undefined,
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
  amountWrap: {
    paddingTop: 56,
  },
  headline: {
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
  amount: {
    fontWeight: "700",
    color: "#fff",
    backgroundColor: "rgba(200, 60, 40, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
});
