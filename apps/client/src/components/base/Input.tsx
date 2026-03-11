import { TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { Text } from "./Text";
import { PLACEHOLDER_COLOR } from "@/theme/colors";

type InputProps = TextInputProps & { label?: string; iconLeft?: string; bare?: boolean };

export function Input({ label, iconLeft, bare, ...props }: InputProps) {
  const innerClass = bare
    ? "ui-row ui-inline-2 items-center gap-1 flex-1 min-h-0"
    : "ui-row ui-inline-2 ui-p-md min-h-[44px] items-center";
  const inner = (
    <View className={innerClass}>
      {iconLeft ? <Text variant="muted">{iconLeft}</Text> : null}
      <TextInput {...props} placeholderTextColor={PLACEHOLDER_COLOR} className="flex-1 py-2 text-text min-w-0" />
    </View>
  );
  if (bare) return inner;
  return (
    <View className="ui-stack-2 bg-panel rounded-lg">
      {label ? <Text variant="muted">{label}</Text> : null}
      {inner}
    </View>
  );
}
