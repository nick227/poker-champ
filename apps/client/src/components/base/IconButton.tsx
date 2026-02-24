import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { PRESS_OPACITY } from "@/theme/animation";
import { Text } from "./Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

export function IconButton({
  icon,
  onPress,
  disabled,
  variant = "ghost",
  badge,
}: {
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "link";
  /** When > 0, shows a compact count badge (e.g. unseen messages). */
  badge?: number;
}) {
  const bg =
    variant === "primary" ? "bg-brand" : variant === "link" ? "bg-transparent border border-transparent" : "bg-transparent border border-border";
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeLabel = showBadge ? (badge > 99 ? "99+" : String(badge)) : "";
  const handlePress = () => {
    if (disabled) return;
    emitSoundEvent("ui.tap");
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className={`ui-touch rounded-md ${bg}`}
    >
      <View>
        {icon}
        {showBadge && (
          <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger flex items-center justify-center px-1">
            <Text variant="caption" className="text-white" style={{ fontSize: 10 }}>
              {badgeLabel}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
