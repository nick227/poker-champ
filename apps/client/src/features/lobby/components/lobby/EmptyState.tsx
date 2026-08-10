import { View } from "react-native";
import { Text } from "@/components/base/Text";

/** Empty message centered inside the list stage frame. */
export function EmptyState({ message }: { message: string }) {
  return (
    <View className="flex-1 min-h-[160px] ui-center border border-border rounded-2 bg-panel px-4 py-8">
      <Text variant="muted" className="text-[13px] text-center">
        {message}
      </Text>
    </View>
  );
}
