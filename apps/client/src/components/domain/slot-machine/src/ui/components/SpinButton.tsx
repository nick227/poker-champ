import React from "react";
import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";

export function SpinButton({
  betCents,
  spinning,
  disabled,
  reducedMotion,
  onPress,
  animatedStyle,
  flashStyle,
  size = 140,
}: {
  betCents: number;
  spinning?: boolean;
  disabled?: boolean;
  reducedMotion?: boolean;
  onPress?: () => void;
  animatedStyle?: StyleProp<ViewStyle>;
  flashStyle?: StyleProp<ViewStyle>;
  size?: number;
}) {
  const idle = useSharedValue(0);
  React.useEffect(() => {
    if (reducedMotion || disabled || spinning) {
      idle.value = withTiming(0, { duration: 180 });
      return;
    }
    idle.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [disabled, idle, reducedMotion, spinning]);
  const glow = useAnimatedStyle(() => ({
    shadowOpacity: disabled ? 0 : 0.35 + idle.value * 0.4,
    shadowRadius: 10 + idle.value * 10,
  }));

  return (
    <Animated.View style={[animatedStyle, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.bezel,
          { width: size, height: size, borderRadius: size / 2 },
          disabled && styles.bezelDisabled,
          flashStyle,
          glow,
        ]}
      >
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.face,
            { borderRadius: size / 2 },
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text style={[styles.title, disabled && styles.dim, { fontSize: size < 130 ? 22 : 28 }]}>SPIN</Text>
          <Text style={[styles.bet, disabled && styles.dim]}>{formatCents(betCents)}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = {
  bezel: {
    padding: 6,
    backgroundColor: casino.goldLo,
    borderWidth: 2,
    borderColor: casino.goldHi,
    shadowColor: casino.gold,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  bezelDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  face: {
    flex: 1,
    backgroundColor: casino.gold,
    borderWidth: 2,
    borderColor: casino.cream,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ translateY: 2 }],
  },
  title: {
    fontWeight: "900" as const,
    letterSpacing: 3,
    color: casino.ink,
  },
  bet: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800" as const,
    letterSpacing: 0.5,
    color: casino.goldLo,
    fontVariant: ["tabular-nums" as const],
  },
  dim: {
    color: "#5a4a20",
  },
};
