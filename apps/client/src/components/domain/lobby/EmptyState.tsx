import { View } from "react-native";
import { Text } from "@/components/base/Text";

export function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 ui-center p-8">
      <Text variant="muted">{message}</Text>
    </View>
  );
}
