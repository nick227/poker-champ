import React from "react";
import { Pressable, Text } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";

export function Chip({ label, active, onPress, disabled }: { label: string; active?: boolean; onPress?: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  const s = makeStyles(theme, (t) => ({
    btn: {
      flex: 1,
      borderWidth: 1,
      borderColor: active ? t.colors.accent1 : t.colors.border,
      backgroundColor: active ? t.colors.bg0 : t.colors.panel,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled ? 0.6 : 1,
    },
    text: {
      fontSize: 13,
      letterSpacing: t.type.trackingWide,
      fontWeight: t.type.weightBold,
      color: active ? t.colors.text : t.colors.textMuted,
      textTransform: "uppercase",
    },
  }));
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, pressed && !disabled && { opacity: 0.85 }]}>
      <Text style={s.text}>{label}</Text>
    </Pressable>
  );
}
