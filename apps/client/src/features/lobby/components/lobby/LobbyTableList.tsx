import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import {
  formatCashLobbyJoinHint,
  resolveCashLobbyJoin,
  type LobbyTableRow,
} from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";

type Props = {
  tables: LobbyTableRow[];
  balanceCents: number;
  sortKey: LobbySortKey;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
};

const COLS: Array<{ key: LobbySortKey; label: string; flex: number }> = [
  { key: "name", label: "Table", flex: 2.2 },
  { key: "blinds", label: "Stakes", flex: 1 },
  { key: "players", label: "Players", flex: 0.9 },
  { key: "buyIn", label: "Buy-in", flex: 1.2 },
  { key: "status", label: "Status", flex: 1 },
];

export function LobbyTableList({
  tables,
  balanceCents,
  sortKey,
  onSort,
  isJoining,
  onJoin,
}: Props) {
  return (
    <View className="flex-1 min-h-0">
      <View className="ui-row items-center border-b border-border px-2 py-2 sticky top-0 bg-bg/90">
        {COLS.map((col) => (
          <Pressable
            key={col.key}
            onPress={() => onSort(col.key)}
            style={{ flex: col.flex }}
            className="px-1"
          >
            <Text
              variant={sortKey === col.key ? "body" : "muted"}
              className="text-[11px] tracking-wide uppercase font-semibold"
            >
              {col.label}
              {sortKey === col.key ? " ▾" : ""}
            </Text>
          </Pressable>
        ))}
        <View style={{ width: 72 }} />
      </View>
      {tables.map((table) => {
        const { canJoin, joinBlockReason } = resolveCashLobbyJoin(table, balanceCents);
        const hint = formatCashLobbyJoinHint(joinBlockReason);
        const joining = isJoining(table.id);
        const live = (table.connectedHumanCount ?? 0) > 0;
        return (
          <Pressable
            key={table.id}
            onPress={() => {
              if (!joining && canJoin) onJoin(table);
            }}
            disabled={joining || !canJoin}
            className="ui-row items-center border-b border-border/60 px-2 py-3 hover:bg-panel-elevated"
          >
            <View style={{ flex: 2.2 }} className="px-1">
              <Text variant="body" className="font-semibold" numberOfLines={1}>
                {table.name}
              </Text>
            </View>
            <View style={{ flex: 1 }} className="px-1">
              <Text variant="body" className="font-mono text-[13px]">
                {formatCents(table.smallBlindCents)}/{formatCents(table.bigBlindCents)}
              </Text>
            </View>
            <View style={{ flex: 0.9 }} className="px-1">
              <Text variant="body" className="font-mono text-[13px]">
                {table.players}/{table.seats}
              </Text>
            </View>
            <View style={{ flex: 1.2 }} className="px-1">
              <Text variant="body" className="font-mono text-[13px]">
                {formatCents(table.minBuyInCents)}
              </Text>
            </View>
            <View style={{ flex: 1 }} className="px-1">
              <Text variant={live ? "body" : "muted"} className="text-[12px]">
                {live ? "Live" : "Waiting"}
              </Text>
              {hint ? (
                <Text variant="muted" className="text-[10px]" numberOfLines={1}>
                  {hint}
                </Text>
              ) : null}
            </View>
            <View style={{ width: 72 }} className="items-end px-1">
              <Text variant={canJoin ? "body" : "muted"} className="text-[12px] font-semibold text-primary">
                {joining ? "…" : canJoin ? "Join" : "—"}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
