import { Pressable } from "react-native";
import { Text } from "@/components/base/Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { PokerActionVariant } from "../tokens/hud.tokens";
import { HUD_ACTION_BORDER, HUD_ACTION_GRADIENT } from "../tokens/hud.tokens";
import { BUTTONS } from "./layout";

const PRESSED_SCALE = 0.97;

export type { PokerActionVariant };

export type PokerActionButtonProps = {
  title: string;
  onPress: () => void;
  variant: PokerActionVariant;
  disabled?: boolean;
  /** Layout-only additions from the caller (e.g. `flex-1 min-w-0`). */
  className?: string;
  testID?: string;
};

/**
 * Bold, color-coded action button (Fold=red, Check/Call=green, Bet/Raise=gold, All-In=red/orange).
 * A dedicated component rather than the shared `Button` intent system so the poker-specific
 * color language here doesn't leak into unrelated buttons across the app.
 */
export function PokerActionButton({
  title,
  onPress,
  variant,
  disabled = false,
  className = "",
  testID,
}: PokerActionButtonProps) {
  const handlePress = () => {
    if (disabled) return;
    emitSoundEvent("ui.tap");
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`btn rounded-xl shadow-md ${HUD_ACTION_GRADIENT[variant]} ${HUD_ACTION_BORDER[variant]} ${className}`.trim()}
      style={({ pressed }) => [
        {
          // Fill the action row's full allocated height (BUTTONS.ROW_HEIGHT) rather than the
          // shared Button's compact ~34px pill — reads as a chunkier, more game-like control
          // without changing the overall action-bar band height (ACTION_BAR_HEIGHT).
          height: BUTTONS.ROW_HEIGHT,
          opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
          transform: [{ scale: disabled ? 1 : pressed ? PRESSED_SCALE : 1 }],
        },
      ]}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        className="text-white font-extrabold text-base tracking-wide"
      >
        {title}
      </Text>
    </Pressable>
  );
}
