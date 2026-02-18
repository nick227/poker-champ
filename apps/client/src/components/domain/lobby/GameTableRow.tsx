import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import type { LobbyTableRow } from "@/lib/lobbyTables";

export function GameTableRow({
  table,
  onJoin,
  onDelete,
  currentUserId,
}: {
  table: LobbyTableRow;
  onJoin: () => void;
  onDelete?: (tableId: string) => void;
  currentUserId?: string;
}) {
  const stakes = table.blinds ?? "—";
  const humanCount = table.humanCount ?? table.players;
  const canDelete =
    onDelete &&
    currentUserId &&
    table.creatorId === currentUserId &&
    humanCount === 0;

  return (
    <View className="ui-surface-card ui-p-lg rounded-lg border-l-2 border-brand-soft">
      <View className="ui-row ui-inline-3 justify-between">
        <View className="flex-1 min-w-[120px] ui-stack-1">
          <Text variant="h2" className="text-base">{table.name}</Text>
          <Text variant="muted">{table.players}/{table.seats} • {stakes}</Text>
        </View>
        <View className="ui-row gap-2">
          {canDelete ? (
            <ConfirmButton title="Delete" onPress={() => onDelete(table.id)} />
          ) : null}
          <ConfirmButton title="Join" onPress={onJoin} />
        </View>
      </View>
    </View>
  );
}
