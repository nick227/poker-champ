import { TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { Text } from "./Text";
import { PLACEHOLDER_COLOR } from "@/theme/colors";

export function Input({ label, iconLeft, ...props }: TextInputProps & { label?: string; iconLeft?: string }) {
  const wrapperClass = "ui-row ui-inline-2 ui-surface ui-p-md";
  return (
    <View className="ui-stack-2">
      {label ? <Text variant="muted">{label}</Text> : null}
      <View className={wrapperClass}>
        {iconLeft ? <Text variant="muted">{iconLeft}</Text> : null}
        <TextInput {...props} placeholderTextColor={PLACEHOLDER_COLOR} className="flex-1 py-3 text-text" />
      </View>
    </View>
  );
}
