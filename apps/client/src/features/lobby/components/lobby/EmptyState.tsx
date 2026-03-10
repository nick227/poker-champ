import { View } from "react-native";
import { Text } from "@/components/base/Text";

export function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 ui-center p-2 bg-panel/80 rounded-lg">
      <Text variant="muted">{message}</Text>
    </View>
  );
}
