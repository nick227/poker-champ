import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
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
  const idle = useSharedValue(0);
  React.useEffect(() => {
    if (reducedMotion) {
      idle.value = 0.35;
      return;
    }
    idle.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [idle, reducedMotion]);
  const plateGlow = useAnimatedStyle(() => ({
    shadowOpacity: 0.18 + idle.value * 0.22,
  }));

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <View style={styles.jewel} />
      <Animated.View style={[styles.plate, plateGlow]}>
        <Animated.View style={flashStyle}>
          <AnimatedText style={styles.top}>{title}</AnimatedText>
        </Animated.View>
        <View style={styles.valueBox}>
          <AnimatedText style={styles.value}>{value}</AnimatedText>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = {
  wrap: {
    width: "100%" as const,
    flexShrink: 0,
    alignItems: "center" as const,
    gap: 4,
  },
  jewel: {
    width: 8,
    height: 8,
    backgroundColor: casino.goldHi,
    transform: [{ rotate: "45deg" }],
  },
  plate: {
    width: "100%" as const,
    borderRadius: 4,
    backgroundColor: casino.ink,
    borderWidth: 2,
    borderColor: casino.goldMid,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 8,
    gap: 4,
    shadowColor: casino.goldHi,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
  },
  top: {
    textAlign: "center" as const,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: "800" as const,
    color: casino.gold,
    textTransform: "uppercase" as const,
  },
  valueBox: {
    alignSelf: "center" as const,
    borderWidth: 1,
    borderColor: casino.goldLo,
    paddingHorizontal: 16,
    paddingVertical: 2,
    minWidth: "42%" as const,
  },
  value: {
    textAlign: "center" as const,
    fontSize: 28,
    letterSpacing: 1,
    fontWeight: "800" as const,
    color: "#fff8e7",
    fontVariant: ["tabular-nums" as const],
  },
};
