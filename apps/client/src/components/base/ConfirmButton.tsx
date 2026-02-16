import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { PRESS_OPACITY } from "@/theme/animation";

export function ConfirmButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1 })}
      className="ui-touch rounded-md bg-brand border-t border-brand-bright/30 px-4 py-3"
    >
      <View>
        <Text variant="body">{title}</Text>
      </View>
    </Pressable>
  );
}
