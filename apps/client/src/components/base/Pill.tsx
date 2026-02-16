import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "./Text";

export type PillVariant = "neutral" | "success" | "warn" | "danger";

const variantClass: Record<PillVariant, string> = {
  neutral: "border-border bg-panel",
  success: "border-success/50 bg-success/10",
  warn: "border-warn/50 bg-warn/10",
  danger: "border-danger/50 bg-danger/10",
};

export function Pill({
  label,
  value,
  variant = "neutral",
  className = "",
}: {
  label: string;
  value: string;
  variant?: PillVariant;
  className?: string;
}) {
  return (
    <View className={`min-w-[5rem] ui-row ui-inline-1 rounded-md border px-2 py-1 ${variantClass[variant]} ${className}`}>
      <Text variant="muted">{label}</Text>
      <Text variant="body" style={{ fontVariant: ["tabular-nums"], minWidth: 40 }}>
        {value}
      </Text>
    </View>
  );
}
