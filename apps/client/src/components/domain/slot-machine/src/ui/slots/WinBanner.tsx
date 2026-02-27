import React from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function WinBanner({ text, animatedStyle }: { text: string; animatedStyle?: any }) {
  const { theme } = useTheme();
  const s = makeStyles(theme, (t) => ({
    wrap: {
      width: "100%",
      minHeight: 44,
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.colors.accent1,
      backgroundColor: t.colors.bg0,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    text: {
      textAlign: "center",
      fontSize: 18,
      fontWeight: t.type.weightHeavy,
      letterSpacing: 2,
      color: t.colors.accent0,
      textTransform: "uppercase",
    },
  }));
  return (
    <Animated.View style={[s.wrap, animatedStyle]}>
      <AnimatedText numberOfLines={1} ellipsizeMode="tail" style={s.text}>{text}</AnimatedText>
    </Animated.View>
  );
}
