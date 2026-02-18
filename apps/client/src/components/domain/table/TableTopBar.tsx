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
    <View
      collapsable={false}
      style={{ flex: 1 }}
      className="ui-row justify-between items-center border-b border-border-subtle ui-p-inline-4 bg-panel"
    >
      <View collapsable={false} className="w-12">{left}</View>
      <View collapsable={false} className="ui-col items-center ui-stack-0" style={{ minHeight: 44 }}>
        <Text variant="label" allowFontScaling={false}>Balance</Text>
        <Text variant="h2" className="font-semibold" allowFontScaling={false}>{formatCents(balanceCents)}</Text>
      </View>
      <View collapsable={false} className="min-w-24 ui-row justify-end ui-inline-1">{right}</View>
    </View>
  );
}
