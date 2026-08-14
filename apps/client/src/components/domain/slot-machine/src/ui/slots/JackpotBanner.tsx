import React from "react";
import { Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function JackpotBanner({
  title,
  value,
  reducedMotion,
  animatedStyle,
  flashStyle,
}: {
  title: string;
  value: string;
  reducedMotion?: boolean;
  animatedStyle?: StyleProp<ViewStyle>;
  flashStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <Animated.View style={flashStyle}>
        <AnimatedText style={styles.top}>{title}</AnimatedText>
      </Animated.View>
      <AnimatedText style={styles.value}>{value}</AnimatedText>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    flexShrink: 0,
    alignItems: "center" as const,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: casino.reelFace,
  },
  top: {
    textAlign: "center" as const,
    fontSize: 10,
    letterSpacing: 5,
    fontWeight: "800" as const,
    color: casino.gold,
    textTransform: "uppercase" as const,
  },
  value: {
    textAlign: "center" as const,
    fontSize: 32,
    letterSpacing: 1,
    fontWeight: "800" as const,
    color: casino.cream,
    fontVariant: ["tabular-nums" as const],
  },
};
