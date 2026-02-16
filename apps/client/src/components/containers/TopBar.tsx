import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";

export function TopBar({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <View className="ui-row justify-between py-3">
      <View className="w-24">{left}</View>
      <View className="flex-1 items-center">
        <Text variant="h2">{title}</Text>
      </View>
      <View className="w-24 items-end">{right}</View>
    </View>
  );
}
