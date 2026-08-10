import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { tablePath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";

type Props = {
  variant?: "stack" | "row";
};

/**
 * Session band: open tables you can resume.
 * Same chip language as filters; sits above actions on every lobby mode.
 */
export function LobbyContinuePlaying({ variant = "stack" }: Props) {
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const lastBuyIn = storeRegistry.use.tables((s) => s.lastBuyInCentsByTableId);
  const tableNames = storeRegistry.use.tables((s) => s.tableNameByTableId);

  if (openTableIds.length === 0) return null;

  const chips = openTableIds.map((id) => {
    const name = tableNames[id] ?? id.slice(0, 8);
    return (
      <Pressable
        key={id}
        onPress={() => router.push(tablePath(id, { buyInCents: lastBuyIn[id] }))}
        className="btn lobby-hud h-7 min-h-[28px] items-center justify-center border border-brand/45 bg-brand-soft px-2.5"
      >
        <Text variant="body" className="text-[12px] font-semibold text-brand">
          {name}
        </Text>
      </Pressable>
    );
  });

  if (variant === "row") {
    return (
      <View className="ui-row items-center gap-2 flex-wrap w-full pb-4">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase shrink-0">
          Your tables
        </Text>
        {chips}
      </View>
    );
  }

  return (
    <View className="ui-stack-2 mb-4 px-4">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        Your tables
      </Text>
      <View className="ui-row items-center flex-wrap gap-2">{chips}</View>
    </View>
  );
}
