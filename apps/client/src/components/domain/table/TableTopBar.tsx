import { View } from "react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

export type TableTopBarProps = {
  balanceCents: number;
  center?: ReactNode;
  right?: ReactNode;
  userName?: string;
};

export function TableTopBar({
  balanceCents,
  center,
  right,
  userName,
}: TableTopBarProps) {
  const normalizedUserName = useMemo(() => {
    const trimmed = userName?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }, [userName]);
  const [lockedUserName, setLockedUserName] = useState<string | undefined>(normalizedUserName);

  useEffect(() => {
    if (lockedUserName) return;
    if (!normalizedUserName) return;
    setLockedUserName(normalizedUserName);
  }, [lockedUserName, normalizedUserName]);

  return (
    <View
      collapsable={false}
      style={{ flex: 1, minHeight: 44 }}
      className="ui-row items-center justify-between ui-p-horizontal-4 px-4"
    >
      <View
        collapsable={false}
        className="ui-col items-start ui-stack-0 pr-2"
        style={{ minHeight: 44, width: "33%" }}
      >
        <Text variant="label" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
          {lockedUserName ?? "unknown"}
        </Text>
        <Text
          variant="h2"
          className="font-semibold"
          allowFontScaling={false}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatCents(balanceCents)}
        </Text>
      </View>
      <View collapsable={false} className="flex-1 items-center ui-row justify-center px-2" style={{ width: "33%" }}>
        {center}
      </View>
      <View collapsable={false} className="flex-1 ui-row justify-end" style={{ width: "33%" }}>
        {right}
      </View>
    </View>
  );
}
