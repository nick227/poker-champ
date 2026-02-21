import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import { formatCents } from "@/lib/format";
import type { LobbyTableRow } from "@/lib/lobbyTables";

export function GameTableRow({
  table,
  balanceCents,
  onJoin,
  onDelete,
  currentUserId,
}: {
  table: LobbyTableRow;
  balanceCents: number;
  onJoin: () => void;
  onDelete?: (tableId: string) => void;
  currentUserId?: string;
}) {
  const stakesStr = `${formatCents(table.smallBlindCents)} / ${formatCents(table.bigBlindCents)}`;
  const minStr = `Min ${formatCents(table.minBuyInCents)}`;
  const canJoin = balanceCents >= table.minBuyInCents;
  const connectedHumanCount = table.connectedHumanCount ?? 0;
  const canDelete =
    onDelete &&
    currentUserId &&
    table.creatorId === currentUserId &&
    connectedHumanCount === 0;

  return (
    <View className="ui-surface-card ui-p-lg rounded-lg border-l-2 border-brand-soft m-4" data-table-id={table.id}>
      <View className="ui-row ui-inline-3 justify-between">
        <View className="flex-1 min-w-[120px] ui-stack-1">
          <Text variant="h2" className="text-base">{table.name}</Text>
          <Text variant="muted">{table.players}/{table.seats} • {stakesStr} • {minStr}</Text>
        </View>
        <View className="ui-row gap-2">
          {canDelete ? (
            <ConfirmButton title="Delete" onPress={() => onDelete(table.id)} />
          ) : null}
          <ConfirmButton
            title="Join"
            onPress={onJoin}
            disabled={!canJoin}
          />
        </View>
      </View>
      {!canJoin && (
        <Text variant="muted" className="text-xs mt-1">Insufficient balance for min buy-in</Text>
      )}
    </View>
  );
}
