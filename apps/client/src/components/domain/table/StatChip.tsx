import { View } from "react-native";
import { Text } from "@/components/base/Text";

export function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View className="ui-surface px-3 py-2">
      <Text variant="muted">{label}</Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}
