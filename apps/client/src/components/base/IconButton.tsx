import { Pressable, View } from "react-native";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { PRESS_OPACITY } from "@/theme/animation";
import { Text } from "./Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

type IconButtonSize = "sm" | "md" | "lg";
type IconButtonIntent = "primary" | "secondary" | "neutral" | "danger" | "ghost";
const PRESSED_SCALE = 0.97;
const ICON_GHOST_PRESSED_BG = "rgba(255, 255, 255, 0.1)";

const INTENT_CLASS: Record<IconButtonIntent, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  neutral: "btn-neutral",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

const SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: "btn-icon-sm",
  md: "btn-icon-md",
  lg: "btn-icon-lg",
};

const INTENT_ICON_CLASS: Record<IconButtonIntent, string> = {
  primary: "text-btn-primary-text",
  secondary: "text-btn-secondary-text",
  neutral: "text-btn-neutral-text",
  danger: "text-btn-danger-text",
  ghost: "text-btn-icon-fg",
};

export function IconButton({
  icon,
  onPress,
  disabled,
  intent,
  size = "md",
  variant = "ghost",
  badge,
}: {
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  intent?: IconButtonIntent;
  size?: IconButtonSize;
  /** @deprecated use `intent` */
  variant?: "primary" | "ghost" | "link";
  /** When > 0, shows a compact count badge (e.g. unseen messages). */
  badge?: number;
}) {
  const resolvedIntent: IconButtonIntent =
    intent ?? (variant === "primary" ? "primary" : variant === "ghost" ? "secondary" : "ghost");
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeLabel = showBadge ? (badge > 99 ? "99+" : String(badge)) : "";
  const iconClassName = INTENT_ICON_CLASS[resolvedIntent];
  const renderedIcon =
    isValidElement(icon)
      ? cloneElement(icon as ReactElement<any>, {
          className: [icon.props?.className, iconClassName].filter(Boolean).join(" "),
        })
      : icon;

  const handlePress = () => {
    if (disabled) return;
    emitSoundEvent("ui.tap");
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
          transform: [{ scale: disabled ? 1 : pressed ? PRESSED_SCALE : 1 }],
        },
        resolvedIntent === "ghost"
          ? { backgroundColor: pressed && !disabled ? ICON_GHOST_PRESSED_BG : "transparent" }
          : {},
      ]}
      className={`btn btn-icon ${INTENT_CLASS[resolvedIntent]} ${SIZE_CLASS[size]}`}
    >
      <View>
        {renderedIcon}
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
