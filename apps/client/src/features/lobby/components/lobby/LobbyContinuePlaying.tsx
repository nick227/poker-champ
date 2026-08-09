import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { tablePath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";

/** Persistent continue-playing list from open multi-table seats. */
export function LobbyContinuePlaying() {
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const lastBuyIn = storeRegistry.use.tables((s) => s.lastBuyInCentsByTableId);

  if (openTableIds.length === 0) return null;

  return (
    <View className="ui-stack-2 mb-3">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        Continue playing
      </Text>
      {openTableIds.map((id) => (
        <Pressable
          key={id}
          onPress={() =>
            router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))
          }
          className="rounded-lg border border-border bg-panel px-3 py-2.5 hover:bg-panel-elevated"
        >
          <Text variant="body" className="font-semibold">
            Table {id.slice(0, 8)}
          </Text>
          <Text variant="muted" className="text-[12px]">
            Resume seat
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
