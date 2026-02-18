import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";

type Variant = "primary" | "ghost" | "danger";

const base = "min-h-[48px] px-4 items-center justify-center flex-row gap-2";
const variants: Record<Variant, string> = {
  primary: "rounded-full bg-brand border-t border-brand-bright/30",
  ghost: "rounded-full bg-transparent border border-border",
  danger: "rounded-full bg-danger border-t border-white/10",
};

const SPINNER_COLOR = "hsl(190 90% 55%)";

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  className = "",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  className?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => ({ opacity: isDisabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={className}
    >
      <View className={`${base} ${variants[variant]} ${className}`} style={{ minHeight: 44 }}>
        {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR} /> : null}
        <Text variant="body" allowFontScaling={false}>{title}</Text>
      </View>
    </Pressable>
  );
}
