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
    <View
      collapsable={false}
      className={`min-w-[5rem] ui-inline-1 rounded-sm border px-2 py-1 ${variantClass[variant]} ${className}`}
      style={{ minHeight: 28, flexDirection: "row", alignItems: "center" }}
    >
      <Text variant="muted" allowFontScaling={false} numberOfLines={1} style={{ minWidth: 0 }}>
        {label}
      </Text>
      <Text
        variant="body"
        allowFontScaling={false}
        style={{ fontVariant: ["tabular-nums"], minWidth: 0 }}
      >
        {value}
      </Text>
    </View>
  );
}
