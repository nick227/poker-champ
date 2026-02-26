import { Pressable } from "react-native";
import { Text } from "@/components/base/Text";
import { TABLE } from "@/constants/copy";

export type HeroSitOutToggleProps = {
  checked: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function HeroSitOutToggle({
  checked,
  disabled = false,
  onPress,
}: HeroSitOutToggleProps) {
  const label = checked ? TABLE.rejoin : TABLE.sitOut;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`mt-2 rounded-full border px-2.5 py-1 ${
        disabled
          ? "border-border-subtle/40 bg-surface-lowest/30"
          : "border-border-subtle bg-surface-lowest/50"
      }`}
    >
      <Text
        variant="label"
        allowFontScaling={false}
        className={disabled ? "text-text-subtle/60" : "text-text-subtle"}
      >
        {label}
      </Text>
    </Pressable>
  );
}
