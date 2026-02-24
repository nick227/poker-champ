import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

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
  const handlePress = () => {
    if (disabled) return;
    emitSoundEvent("ui.tap");
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [{ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 }, { minHeight: 44 }]}
      className={`ui-touch rounded-full px-3 py-2 min-w-[52px] items-center justify-center ${bg} ${className}`}
    >
      <Text variant="body" className={selected ? "text-text" : "text-muted"} allowFontScaling={false}>{title}</Text>
    </Pressable>
  );
}
