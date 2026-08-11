import React from "react";
import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import { formatCents } from "../../engine/format";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function PrimaryButton({
  title,
  subtitle,
  disabled,
  onPress,
  animatedStyle,
  flashStyle,
  betCents,
}: {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress?: () => void;
  animatedStyle?: StyleProp<ViewStyle>;
  flashStyle?: StyleProp<ViewStyle>;
  betCents?: number;
}) {
  return (
    <Animated.View style={animatedStyle}>
      <Animated.View style={[styles.bezel, disabled && styles.bezelDisabled, flashStyle]}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [styles.face, pressed && !disabled && { opacity: 0.92, transform: [{ translateY: 1 }] }]}
        >
          <AnimatedText style={[styles.title, disabled && styles.titleDisabled]}>{title}</AnimatedText>
          {typeof betCents === "number" ? (
            <AnimatedText style={[styles.bet, disabled && styles.titleDisabled]}>{formatCents(betCents)}</AnimatedText>
          ) : null}
          {!!subtitle && (
            <AnimatedText style={[styles.sub, disabled && styles.titleDisabled]}>{subtitle}</AnimatedText>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = {
  bezel: {
    width: "100%" as const,
    borderRadius: 999,
    padding: 4,
    backgroundColor: casino.goldLo,
    borderWidth: 2,
    borderColor: casino.goldHi,
    shadowColor: casino.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  bezelDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  face: {
    borderRadius: 999,
    backgroundColor: casino.gold,
    borderWidth: 2,
    borderColor: casino.goldHi,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: {
    fontSize: 26,
    fontWeight: "900" as const,
    letterSpacing: 4,
    color: casino.ink,
  },
  bet: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "800" as const,
    letterSpacing: 1,
    color: casino.crimsonLo,
  },
  sub: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 2,
    color: casino.goldLo,
    textTransform: "uppercase" as const,
  },
  titleDisabled: {
    color: "#5a4a20",
  },
};
