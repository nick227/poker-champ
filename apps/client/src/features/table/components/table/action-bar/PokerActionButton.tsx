import { Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { HUD_ACTION, type PokerActionVariant } from "../tokens/hud.tokens";
import { BUTTONS } from "./layout";

const PRESSED_SCALE = 0.98;

export type { PokerActionVariant };

export type PokerActionButtonProps = {
  title: string;
  onPress: () => void;
  variant: PokerActionVariant;
  disabled?: boolean;
  className?: string;
  testID?: string;
  style?: ViewStyle;
};

/**
 * Flat, high-contrast poker action control.
 * Solid fill + bold label — no soft gradients, no shared `.btn` pill chrome.
 */
export function PokerActionButton({
  title,
  onPress,
  variant,
  disabled = false,
  className = "",
  testID,
  style,
}: PokerActionButtonProps) {
  const paint = HUD_ACTION[variant];

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
      className={className}
      style={({ pressed }) => [
        {
          height: BUTTONS.ROW_HEIGHT,
          minHeight: BUTTONS.ROW_HEIGHT,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: paint.border,
          backgroundColor: paint.bg,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 10,
          opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
          transform: [{ scale: disabled ? 1 : pressed ? PRESSED_SCALE : 1 }],
        },
        style,
      ]}
    >
      <View pointerEvents="none">
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={{
            color: paint.text,
            fontWeight: "800",
            fontSize: 15,
            letterSpacing: 0.6,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
