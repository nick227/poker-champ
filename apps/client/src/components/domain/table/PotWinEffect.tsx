import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import type { ReactNode } from "react";
import { DURATION } from "@/theme/animation";
import { POT_WIN_RING } from "@/theme/colors";

/** Subtle gold ring that blooms then softens around winner content. */
export function PotWinRing({ children }: { children: ReactNode }) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.02,
          duration: DURATION.fast,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: DURATION.fast,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [scale, opacity]);

  return (
    <View style={{ position: "relative", alignSelf: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          top: -10,
          left: -10,
          right: -10,
          bottom: -10,
          borderWidth: 2,
          borderColor: POT_WIN_RING,
          borderRadius: 16,
          opacity,
          transform: [{ scale }],
        }}
        pointerEvents="none"
      />
      <View style={{ zIndex: 1 }}>{children}</View>
    </View>
  );
}

