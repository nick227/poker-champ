import { View } from "react-native";
import { Text } from "./Text";

type Variant = "neutral" | "success" | "danger";

const variantClass: Record<Variant, string> = {
  neutral: "bg-panel border-border",
  success: "bg-success/20 border-success/50",
  danger: "bg-danger/20 border-danger/50",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: string;
  variant?: Variant;
}) {
  return (
    <View className={`rounded-md border px-2 py-0.5 ${variantClass[variant]}`}>
      <Text variant="muted">{children}</Text>
    </View>
  );
}
