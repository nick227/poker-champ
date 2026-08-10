import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { tablePath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";

type Props = {
  /** Horizontal chip strip for desktop primary column. */
  variant?: "stack" | "row";
};

/** Persistent continue-playing from open multi-table seats. */
export function LobbyContinuePlaying({ variant = "stack" }: Props) {
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const lastBuyIn = storeRegistry.use.tables((s) => s.lastBuyInCentsByTableId);
  const tableNames = storeRegistry.use.tables((s) => s.tableNameByTableId);

  if (openTableIds.length === 0) return null;

  if (variant === "row") {
    return (
      <View className="ui-row items-center flex-wrap gap-2 pb-3">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase mr-1">
          Continue
        </Text>
        {openTableIds.map((id) => {
          const name = tableNames[id] ?? id.slice(0, 8);
          return (
            <Pressable
              key={id}
              onPress={() => router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))}
              className="rounded-md border border-primary/40 bg-brand-soft px-3 py-1.5 hover:bg-panel-elevated"
            >
              <Text variant="body" className="text-[13px] font-semibold">
                Resume: {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View className="ui-stack-2 mb-3">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        Continue playing
      </Text>
      {openTableIds.map((id) => {
        const name = tableNames[id] ?? id.slice(0, 8);
        return (
          <Pressable
            key={id}
            onPress={() => router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 hover:bg-panel-elevated"
          >
            <Text variant="body" className="font-semibold">
              {name}
            </Text>
            <Text variant="muted" className="text-[12px]">
              Resume seat
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
