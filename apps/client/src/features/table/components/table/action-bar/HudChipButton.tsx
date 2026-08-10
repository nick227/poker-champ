import { Pressable } from "react-native";
import { Text } from "@/components/base/Text";
import { PRESS_OPACITY } from "@/theme/animation";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { HUD_CHIP } from "../tokens/hud.tokens";
import { BUTTONS } from "./layout";

export type HudChipButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
};

/** Flat secondary wager chip — readable white on dark, no soft neutral mute. */
export function HudChipButton({
  title,
  onPress,
  disabled = false,
  danger = false,
}: HudChipButtonProps) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        emitSoundEvent("ui.tap");
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        height: BUTTONS.CHIPS_ROW_HEIGHT,
        minWidth: 56,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: danger ? HUD_CHIP.allInBorder : HUD_CHIP.border,
        backgroundColor: HUD_CHIP.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
      })}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          color: danger ? HUD_CHIP.allInText : HUD_CHIP.text,
          fontWeight: "700",
          fontSize: 12,
          letterSpacing: 0.4,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
