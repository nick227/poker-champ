import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { tablePath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";

type Props = {
  /** Banner strip for desktop; stacked list for mobile. */
  variant?: "stack" | "row";
};

/** Resume open multi-table seats — distinct from Start a game / create actions. */
export function LobbyContinuePlaying({ variant = "stack" }: Props) {
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const lastBuyIn = storeRegistry.use.tables((s) => s.lastBuyInCentsByTableId);

  if (openTableIds.length === 0) return null;

  if (variant === "row") {
    return (
      <View className="mb-3 rounded-lg border border-primary/40 bg-brand-soft px-3 py-2.5">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase mb-2">
          Resume open tables
        </Text>
        <View className="ui-row items-center flex-wrap gap-2">
          {openTableIds.map((id) => (
            <Pressable
              key={id}
              onPress={() => router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))}
              className="rounded-md border border-primary/50 bg-panel px-3 py-2 hover:bg-panel-elevated"
            >
              <Text variant="body" className="text-[13px] font-semibold">
                Resume {id.slice(0, 8)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="ui-stack-2 mb-3">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        Continue playing
      </Text>
      {openTableIds.map((id) => (
        <Pressable
          key={id}
          onPress={() => router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))}
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
