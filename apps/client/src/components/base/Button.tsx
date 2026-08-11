import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

type LegacyVariant = "primary" | "ghost" | "danger" | "link" | "accent";
export type ButtonIntent = "primary" | "secondary" | "neutral" | "danger" | "ghost" | "accent";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonShape = "pill" | "row" | "hud";

const INTENT_CLASS: Record<ButtonIntent, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  neutral: "btn-neutral",
  danger: "btn-danger",
  ghost: "btn-ghost",
  accent: "btn-accent",
};

const SELECTED_CLASS: Record<ButtonIntent, string> = {
  primary: "btn-primary-selected",
  secondary: "btn-secondary-selected",
  neutral: "btn-neutral-selected",
  danger: "",
  ghost: "",
  accent: "btn-accent-selected",
};

const INTENT_TEXT_CLASS: Record<ButtonIntent, string> = {
  primary: "text-btn-primary-text",
  secondary: "text-btn-secondary-text",
  neutral: "text-btn-neutral-text",
  danger: "text-btn-danger-text",
  ghost: "text-accent-purple",
  accent: "text-btn-accent-text",
};

const SHAPE_SIZE_CLASS: Record<ButtonShape, Record<ButtonSize, string>> = {
  pill: {
    sm: "btn-pill-sm",
    md: "btn-pill-md",
    lg: "btn-pill-lg",
  },
  row: {
    sm: "btn-row",
    md: "btn-row",
    lg: "btn-row",
  },
  hud: {
    sm: "btn-hud-sm",
    md: "btn-hud-md",
    lg: "btn-hud-lg",
  },
};

const SPINNER_COLOR = "hsl(190 90% 55%)";
const PRESSED_SCALE = 0.97;

function resolveIntent(intent?: ButtonIntent, variant?: LegacyVariant): ButtonIntent {
  if (intent) return intent;
  if (variant === "primary") return "primary";
  if (variant === "ghost") return "secondary";
  if (variant === "danger") return "danger";
  if (variant === "link") return "ghost";
  if (variant === "accent") return "accent";
  return "neutral";
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  intent,
  size = "md",
  shape = "pill",
  selected = false,
  variant,
  leftIcon,
  rightIcon,
  className = "",
  textClassName = "",
  minWidth = 0,
  marginRight = 0,
  marginLeft = 0,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  intent?: ButtonIntent;
  size?: ButtonSize;
  shape?: ButtonShape;
  selected?: boolean;
  /** @deprecated use `intent` */
  variant?: LegacyVariant;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  textClassName?: string;
  minWidth?: number;
  marginRight?: number;
  marginLeft?: number;
}) {
  const isDisabled = disabled || loading;
  const resolvedIntent = resolveIntent(intent, variant);
  const resolvedClassName = [
    "btn",
    INTENT_CLASS[resolvedIntent],
    SHAPE_SIZE_CLASS[shape][size],
    selected ? `btn-selected ${SELECTED_CLASS[resolvedIntent]}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const resolvedTextClassName = [INTENT_TEXT_CLASS[resolvedIntent], textClassName].filter(Boolean).join(" ");

  const handlePress = () => {
    if (isDisabled) return;
    emitSoundEvent("ui.tap");
    if (typeof onPress !== "function") {
      throw new Error(`Button "${title}" received a non-function onPress`);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      className={`${resolvedClassName} min-w-0 overflow-hidden`}
      style={({ pressed }) => [
        {
          opacity: isDisabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
          transform: [{ scale: isDisabled ? 1 : pressed ? PRESSED_SCALE : 1 }],
        },
        { minWidth, marginRight, marginLeft },
      ]}
    >
      <View className="flex-row items-center justify-center gap-2 min-w-0 flex-1">
        {leftIcon}
        {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR} /> : null}
        <Text
          numberOfLines={1}
          variant="body"
          allowFontScaling={false}
          className={`${resolvedTextClassName} min-w-0 flex-shrink`}
        >
          {title}
        </Text>
        {rightIcon}
      </View>
    </Pressable>
  );
}
