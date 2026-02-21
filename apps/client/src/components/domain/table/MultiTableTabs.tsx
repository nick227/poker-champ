import { View, Pressable } from "react-native";
import { Text } from "@/components/base/Text";

const MAX_VISIBLE_TABS = 4;

type MultiTableTabsProps = {
  openTableIds: string[];
  activeTableId?: string | null;
  onSelectTable: (tableId: string) => void;
  onOpenMoreTables?: () => void;
};

export function MultiTableTabs({
  openTableIds,
  activeTableId,
  onSelectTable,
  onOpenMoreTables,
}: MultiTableTabsProps) {

  if (!openTableIds.length) return null;

  const visibleIds = openTableIds.slice(0, MAX_VISIBLE_TABS);
  const overflowCount = openTableIds.length - MAX_VISIBLE_TABS;

  return (
    <View className="flex-row gap-2">
      {visibleIds.map((id) => {
        const active = id === activeTableId;
        return (
          <Pressable
            key={id}
            onPress={() => onSelectTable(id)}
            className={active ? "rounded-md bg-brand px-3 py-2" : "ui-surface px-3 py-2"}
          >
            <Text variant={active ? "body" : "muted"}>{id.slice(0, 6)}</Text>
          </Pressable>
        );
      })}
      {overflowCount > 0 && onOpenMoreTables ? (
        <Pressable onPress={onOpenMoreTables} className="ui-surface px-3 py-2">
          <Text variant="muted">+{overflowCount}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
