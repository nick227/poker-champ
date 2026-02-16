import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export function TableTopBar({
  balanceCents,
  left,
  right,
}: {
  balanceCents: number;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View className="min-h-[52px] ui-row justify-between items-center border-b border-border-subtle ui-p-inline-4 bg-panel">
      <View className="w-12">{left}</View>
      <View className="ui-col items-center ui-stack-0">
        <Text variant="label">Balance</Text>
        <Text variant="h2" className="font-semibold">{formatCents(balanceCents)}</Text>
      </View>
      <View className="min-w-24 ui-row justify-end ui-inline-1">{right}</View>
    </View>
  );
}
