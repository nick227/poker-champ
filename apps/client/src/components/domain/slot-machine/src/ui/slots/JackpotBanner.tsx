import React from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function JackpotBanner({ title, value, animatedStyle, flashStyle }: { title: string; value: string; animatedStyle?: any; flashStyle?: any }) {
  const { theme } = useTheme();
  const s = makeStyles(theme, (t) => ({
    wrap: {
      width: "100%",
      borderWidth: 2,
      borderColor: t.colors.accent1,
      backgroundColor: t.colors.bg0,
      paddingVertical: 10,
      paddingHorizontal: 4,
      gap: 4,
    },
    top: {
      textAlign: "center",
      fontSize: 24,
      letterSpacing: 3,
      fontWeight: t.type.weightHeavy,
      color: "#ffffff",
      textTransform: "uppercase",
    },
    value: {
      textAlign: "center",
      fontSize: 22,
      letterSpacing: 1,
      fontWeight: t.type.weightHeavy,
      color: t.colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: t.colors.border,
    },
  }));

  return (
    <Animated.View style={[s.wrap, animatedStyle]}>
      <Animated.View style={flashStyle}>
        <AnimatedText style={s.top}>{title}</AnimatedText>
      </Animated.View>
    </Animated.View>
  );
}
