import { Pressable, View } from "react-native";

export function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      className={`h-8 w-14 rounded-full ${value ? "bg-brand" : "bg-panel border border-border"} ${disabled ? "opacity-50" : ""}`}
    >
      <View
        className={`absolute top-1 h-6 w-6 rounded-full bg-bg ${value ? "right-1" : "left-1"}`}
      />
    </Pressable>
  );
}
