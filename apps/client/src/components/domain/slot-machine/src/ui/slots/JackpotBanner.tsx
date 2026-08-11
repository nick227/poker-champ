import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function JackpotBanner({
  title,
  value,
  animatedStyle,
  flashStyle,
}: {
  title: string;
  value: string;
  animatedStyle?: StyleProp<ViewStyle>;
  flashStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <View style={styles.plate}>
        <Animated.View style={flashStyle}>
          <AnimatedText style={styles.top}>{title}</AnimatedText>
        </Animated.View>
        <View style={styles.divider} />
        <AnimatedText style={styles.value}>{value}</AnimatedText>
      </View>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    borderRadius: 10,
    padding: 3,
    backgroundColor: casino.goldMid,
    borderWidth: 2,
    borderColor: casino.goldHi,
  },
  plate: {
    borderRadius: 7,
    backgroundColor: casino.ink,
    borderWidth: 2,
    borderColor: casino.goldLo,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 2,
  },
  top: {
    textAlign: "center" as const,
    fontSize: 15,
    letterSpacing: 3,
    fontWeight: "900" as const,
    color: casino.goldHi,
    textTransform: "uppercase" as const,
  },
  value: {
    textAlign: "center" as const,
    fontSize: 26,
    letterSpacing: 1,
    fontWeight: "900" as const,
    color: "#fff4c2",
  },
  divider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: casino.goldLo,
    opacity: 0.55,
  },
};
