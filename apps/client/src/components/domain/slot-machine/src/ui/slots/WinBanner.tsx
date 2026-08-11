import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function WinBanner({ text, animatedStyle }: { text: string; animatedStyle?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <AnimatedText numberOfLines={1} ellipsizeMode="tail" style={styles.text}>
        {text}
      </AnimatedText>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    minHeight: 40,
    justifyContent: "center" as const,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: casino.goldMid,
    backgroundColor: casino.ink,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    textAlign: "center" as const,
    fontSize: 16,
    fontWeight: "900" as const,
    letterSpacing: 2,
    color: casino.goldHi,
    textTransform: "uppercase" as const,
  },
};
