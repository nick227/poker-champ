import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { PRESS_OPACITY } from "@/theme/animation";

export function IconButton({
  icon,
  onPress,
  disabled,
  variant = "ghost",
}: {
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const bg = variant === "primary" ? "bg-brand" : "bg-transparent border border-border";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={`ui-touch rounded-md ${bg}`}
    >
      <View>{icon}</View>
    </Pressable>
  );
}
