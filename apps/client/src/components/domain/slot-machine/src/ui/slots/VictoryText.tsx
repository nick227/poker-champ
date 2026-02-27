import React from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function VictoryText({ animatedStyle }: { animatedStyle?: any }) {
  const { theme } = useTheme();
  const s = makeStyles(theme, (t) => ({
    text: {
      textAlign: "center",
      fontSize: 32,
      fontWeight: t.type.weightHeavy,
      letterSpacing: 4,
      color: "#FFD700",
      textTransform: "uppercase",
      textShadowColor: "#FF6B35",
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 8,
      position: "absolute",
      top: "50%",
      left: 0,
      right: 0,
      marginTop: -20,
      pointerEvents: "none",
    },
  }));

  return (
    <Animated.View style={animatedStyle}>
      <AnimatedText style={s.text}>JACKPOT!</AnimatedText>
    </Animated.View>
  );
}
