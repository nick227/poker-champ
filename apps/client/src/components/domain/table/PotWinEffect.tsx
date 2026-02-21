import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import type { ReactNode } from "react";

const CHASER_COLORS = [
  "#FFD700",
  "#FF6B6B",
  "#4ECDC4",
  "#A855F7",
  "#FFD700",
];

const CHASER_DURATION = 800;

export function PotWinRing({ children }: { children: ReactNode }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animValue, {
        toValue: CHASER_COLORS.length - 1,
        duration: CHASER_DURATION,
        useNativeDriver: true,
      })
    ).start();
  }, [animValue]);

  const createChaserStyle = (index: number) => {
    const color = CHASER_COLORS[index];

    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderWidth: 4,
      borderColor: color,
      borderRadius: 14,
      opacity: animValue.interpolate({
        inputRange: [index - 1, index, index + 1],
        outputRange: [0, 1, 0],
        extrapolate: "clamp",
      }),
    };
  };

  return (
    <View style={wrapperStyle}>
      <View style={baseRingStyle} pointerEvents="none" />
      {CHASER_COLORS.map((_, i) => (
        <Animated.View
          key={i}
          style={createChaserStyle(i)}
          pointerEvents="none"
        />
      ))}
      <View style={contentSlotStyle}>{children}</View>
    </View>
  );
}

const wrapperStyle = {
  position: "relative" as const,
  width: "100%" as const,
  flexGrow: 0,
  flexShrink: 0,
};

const contentSlotStyle = {
  zIndex: 1 as const,
  width: "100%" as const,
};

const baseRingStyle = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderWidth: 4,
  borderColor: "rgba(255, 215, 0, 0.3)",
  borderRadius: 14,
};
