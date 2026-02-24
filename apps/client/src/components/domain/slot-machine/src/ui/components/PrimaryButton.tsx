import React from "react";
import { Pressable, Text } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

export function PrimaryButton({ title, subtitle, disabled, onPress, animatedStyle }: { title: string; subtitle?: string; disabled?: boolean; onPress?: () => void; animatedStyle?: any }) {
  const { theme } = useTheme();
  const s = makeStyles(theme, (t) => ({
    btn: {
      width: "100%",
      borderWidth: 2,
      borderColor: disabled ? t.colors.border : t.colors.accent1,
      backgroundColor: disabled ? t.colors.panel : t.colors.accent0,
      paddingVertical: 16,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled ? 0.55 : 1,
    },
    title: {
      fontSize: 22,
      fontWeight: t.type.weightHeavy,
      letterSpacing: t.type.trackingWide + 0.5,
      color: disabled ? t.colors.textMuted : t.colors.bg0,
    },
    sub: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: t.type.weightHeavy,
      letterSpacing: t.type.trackingWide,
      color: disabled ? t.colors.textMuted : t.colors.bg0,
      textTransform: "uppercase",
    },
  }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, pressed && !disabled && { opacity: 0.9 }]}>
        <Text style={s.title}>{title}</Text>
        {!!subtitle && <Text style={s.sub}>{subtitle}</Text>}
      </Pressable>
    </Animated.View>
  );
}
