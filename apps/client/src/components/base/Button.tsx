import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";

type Variant = "primary" | "ghost" | "danger";

const base = "min-h-[48px] px-4 items-center justify-center";
const variants: Record<Variant, string> = {
  primary: "rounded-full bg-brand border-t border-brand-bright/30",
  ghost: "rounded-full bg-transparent border border-border",
  danger: "rounded-full bg-danger border-t border-white/10",
};

export function Button({
  title,
  onPress,
  disabled,
  variant = "primary",
  className = "",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={className}
    >
      <View className={`${base} ${variants[variant]} ${className}`}>
        <Text variant="body">{title}</Text>
      </View>
    </Pressable>
  );
}
