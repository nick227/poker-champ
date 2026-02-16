import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { formatCents } from "@/lib/format";

type SliderProps = {
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  disabled?: boolean;
  step?: number;
};

export function Slider({ value, min, max, onValueChange, disabled, step = 1 }: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const inc = () => {
    if (disabled) return;
    onValueChange(Math.min(max, value + step));
  };

  const dec = () => {
    if (disabled) return;
    onValueChange(Math.max(min, value - step));
  };

  return (
    <View className={`ui-row ui-inline-2 ${disabled ? "opacity-50" : ""}`}>
      <Pressable onPress={dec} className="ui-touch">
        <Text variant="body">−</Text>
      </Pressable>
      <View className="h-3 flex-1 flex-row rounded-full border border-border bg-panel">
        <View style={{ width: `${pct}%` }} className="rounded-l-full bg-brand" />
      </View>
      <Pressable onPress={inc} className="ui-touch">
        <Text variant="body">+</Text>
      </Pressable>
      <Text variant="body">{formatCents(value)}</Text>
    </View>
  );
}
