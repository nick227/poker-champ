import { View } from "react-native";
import { Text } from "@/components/base/Text";

export function DealerButton({ size = "small" }: { size?: "small" | "large" }) {
  return (
    <View 
      className={`rounded-full bg-blue-500 ui-center justify-center ${
        size === "small" ? "w-6 h-6" : "w-8 h-8"
      }`}
      accessibilityLabel="Dealer button"
      accessibilityRole="button"
    >
      <Text 
        className={`text-white font-bold ${
          size === "small" ? "text-xs" : "text-sm"
        }`}
      >
        D
      </Text>
    </View>
  );
}
