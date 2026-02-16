import { View } from "react-native";
import { StatChip } from "@/components/domain/table/StatChip";
import { Text } from "@/components/base/Text";

export type PanelKey = "realtime" | "stats";

type PanelProps = {
  tableId: string;
};

type PanelDefinition = {
  key: PanelKey;
  label: string;
  component: (props: PanelProps) => JSX.Element;
};

function RealtimePanel({ tableId }: PanelProps) {
  return (
    <View className="flex-1 items-center justify-center rounded-lg border border-border bg-panel">
      <View className="p-4">
        <StatChip label="Realtime table view" value={`stub:${tableId.slice(0, 6)}`} />
      </View>
    </View>
  );
}

function StatsPanel() {
  return (
    <View className="flex-1 items-center justify-center rounded-lg border border-border bg-panel p-4">
      <Text variant="muted">Table statistics panel (registry-driven)</Text>
    </View>
  );
}

const panelByKey: Record<PanelKey, PanelDefinition> = {
  realtime: { key: "realtime", label: "Realtime", component: RealtimePanel },
  stats: { key: "stats", label: "Stats", component: StatsPanel },
};

const panelOrdered: PanelDefinition[] = [panelByKey.realtime, panelByKey.stats];

export const panelRegistry = {
  byKey: panelByKey,
  ordered: panelOrdered,
} as const;
