import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";

export function ChipButton({
  title,
  onPress,
  selected,
  disabled,
  selectedAccent = "brand",
  className = "",
}: {
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  selectedAccent?: "brand" | "gold";
  className?: string;
}) {
  const bg = selected
    ? selectedAccent === "gold"
      ? "bg-gold"
      : "bg-brand"
    : "ui-surface";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={`ui-touch rounded-full px-3 py-2 min-w-[52px] items-center justify-center ${bg} ${className}`}
    >
      <Text variant="body" className={selected ? "text-text" : "text-muted"}>{title}</Text>
    </Pressable>
  );
}
