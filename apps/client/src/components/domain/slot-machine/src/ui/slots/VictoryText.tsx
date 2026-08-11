import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { textShadowStyle } from "@/theme/textShadow";
import { casino } from "../../theme/casinoCabinet";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function VictoryText({ animatedStyle }: { animatedStyle?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={[styles.wrap, animatedStyle]} pointerEvents="none">
      <AnimatedText style={styles.text}>JACKPOT!</AnimatedText>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    position: "absolute" as const,
    top: "42%" as const,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: "center" as const,
  },
  text: {
    textAlign: "center" as const,
    fontSize: 36,
    fontWeight: "900" as const,
    letterSpacing: 4,
    color: casino.goldHi,
    textTransform: "uppercase" as const,
    ...textShadowStyle({ color: casino.flash, offset: { width: 2, height: 2 }, radius: 8 }),
  },
};
