import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

type Variant = "primary" | "ghost" | "danger" | "link";

const base = "min-h-[48px] px-4 items-center justify-center flex-row gap-2";
const variants: Record<Variant, string> = {
  primary: "rounded-full bg-brand border-t border-brand-bright/30",
  ghost: "rounded-full bg-transparent border border-border",
  danger: "rounded-full bg-danger border-t border-white/10",
  link: "rounded-full bg-transparent border border-transparent",
};

const SPINNER_COLOR = "hsl(190 90% 55%)";

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  className = "",
  minWidth = 0,
  marginRight = 0,
  marginLeft = 0,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  className?: string;
  minWidth?: number;
  marginRight?: number;
  marginLeft?: number;
}) {
  const isDisabled = disabled || loading;
  const handlePress = () => {
    if (isDisabled) return;
    emitSoundEvent("ui.tap");
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => ({ opacity: isDisabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={className}
    >
      <View className={`${base} ${variants[variant]} ${className}`} style={{ minHeight: 44, minWidth: minWidth, marginRight: marginRight, marginLeft: marginLeft }}>
        <Text variant="body" allowFontScaling={false}>
        {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR} /> : title}
        </Text>
      </View>
    </Pressable>
  );
}
