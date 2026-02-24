import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export type TableTopBarProps = {
  balanceCents: number;
  right?: ReactNode;
  userName?: string;
};

export function TableTopBar({
  balanceCents,
  right,
  userName,
}: TableTopBarProps) {
  return (
    <View
      collapsable={false}
      style={{ flex: 1 }}
      className="ui-row items-center justify-center ui-p-horizontal-4 px-4"
    >
      <View collapsable={false} className="ui-col items-center ui-stack-0" style={{ minHeight: 44 }}>
        <Text variant="label" allowFontScaling={false}>{userName ?? "unknown"}</Text>
        <Text variant="h2" className="font-semibold" allowFontScaling={false}>{formatCents(balanceCents)}</Text>
      </View>
      <View collapsable={false} className="min-w-24 ui-row justify-end ui-inline-4">{right}</View>
    </View>
  );
}
