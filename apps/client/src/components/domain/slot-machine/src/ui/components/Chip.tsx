import React from "react";
import { Pressable, Text } from "react-native";
import { casino } from "../../theme/casinoCabinet";

export function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        active ? styles.btnActive : styles.btnIdle,
        disabled && { opacity: 0.55 },
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.text, active ? styles.textActive : styles.textIdle]}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  btn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 2,
    paddingVertical: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  btnActive: {
    borderColor: casino.goldHi,
    backgroundColor: casino.gold,
  },
  btnIdle: {
    borderColor: casino.goldLo,
    backgroundColor: casino.bg,
  },
  text: {
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  textActive: {
    color: casino.ink,
  },
  textIdle: {
    color: casino.goldHi,
  },
};
