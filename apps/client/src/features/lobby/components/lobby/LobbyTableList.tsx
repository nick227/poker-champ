import { Pressable, ScrollView, View } from "react-native";
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
  /** When false, rows flow in the parent scroll (mobile). Default true for desktop stage. */
  scrollable?: boolean;
  /** Phone: name+meta row, no fixed Join column. */
  compact?: boolean;
};

const JOIN_W = 72;

const DESKTOP_COLS: Array<{ key: LobbySortKey; label: string; flex: number }> = [
  { key: "name", label: "Table", flex: 2.4 },
  { key: "blinds", label: "Stakes", flex: 1.1 },
  { key: "players", label: "Seats", flex: 0.8 },
  { key: "buyIn", label: "Buy-in", flex: 1 },
  { key: "status", label: "Status", flex: 0.9 },
];

/** Dense inset list stage — game-client table browser. */
export function LobbyTableList({
  tables,
  balanceCents,
  sortKey,
  onSort,
  isJoining,
  onJoin,
  scrollable = true,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <View className="border border-border rounded-2 overflow-hidden bg-panel">
        <View className="ui-row items-center border-b border-border bg-panel-elevated px-3 h-9">
          {(
            [
              { key: "name" as const, label: "Table", flex: 1 },
              { key: "players" as const, label: "Seats", flex: 0 },
              { key: "status" as const, label: "Status", flex: 0 },
            ] as const
          ).map((col) => (
            <Pressable
              key={col.key}
              onPress={() => onSort(col.key)}
              className="btn h-9 justify-center rounded-none px-1"
              style={{
                flex: col.flex || undefined,
                width: col.flex === 0 ? (col.key === "players" ? 56 : 72) : undefined,
                backgroundColor: "transparent",
                borderRadius: 0,
              }}
            >
              <Text
                variant={sortKey === col.key ? "body" : "muted"}
                className={`text-[11px] tracking-wide uppercase font-semibold ${
                  sortKey === col.key ? "text-gold" : ""
                }`}
                numberOfLines={1}
              >
                {col.label}
                {sortKey === col.key ? " ▾" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
        <View>
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
                className="btn ui-row items-center border-b border-border/40 px-3 min-h-[52px] py-2 rounded-none active:bg-panel-elevated"
                style={{ borderRadius: 0, backgroundColor: "transparent", opacity: canJoin || joining ? 1 : 0.75 }}
              >
                <View className="flex-1 pr-2 min-w-0">
                  <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
                    {table.name}
                  </Text>
                  <Text variant="muted" className="font-mono text-[11px] tabular-nums" numberOfLines={1}>
                    {formatCents(table.smallBlindCents)}/{formatCents(table.bigBlindCents)}
                    {" · "}
                    {formatCents(table.minBuyInCents)} buy-in
                  </Text>
                  {!canJoin && hint ? (
                    <Text variant="muted" className="text-[11px] text-warn" numberOfLines={1}>
                      {hint}
                    </Text>
                  ) : joining ? (
                    <Text variant="muted" className="text-[11px] text-gold" numberOfLines={1}>
                      Joining…
                    </Text>
                  ) : null}
                </View>
                <View style={{ width: 56 }} className="items-center">
                  <Text variant="body" className="font-mono text-[12px] tabular-nums" numberOfLines={1}>
                    {table.players}/{table.seats}
                  </Text>
                </View>
                <View style={{ width: 72 }} className="items-end">
                  <View className="ui-row items-center gap-1.5">
                    <View className={`h-1.5 w-1.5 rounded-full ${live ? "bg-brand" : "bg-border"}`} />
                    <Text
                      variant={live ? "body" : "muted"}
                      className={`text-[12px] ${live ? "text-brand font-semibold" : ""}`}
                      numberOfLines={1}
                    >
                      {live ? "Live" : "Wait"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const rows = tables.map((table) => {
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
        className="btn ui-row items-center border-b border-border/40 px-3 min-h-[44px] py-1.5 rounded-none hover:bg-panel-elevated active:bg-panel-elevated"
        style={{ backgroundColor: "transparent", borderRadius: 0 }}
      >
        {DESKTOP_COLS.map((col) => {
          let content: string;
          if (col.key === "name") content = table.name;
          else if (col.key === "blinds")
            content = `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
          else if (col.key === "players") content = `${table.players}/${table.seats}`;
          else if (col.key === "buyIn") content = formatCents(table.minBuyInCents);
          else content = live ? "Live" : "Waiting";

          return (
            <View key={col.key} style={{ flex: col.flex }} className="pr-2">
              {col.key === "status" ? (
                <>
                  <View className="ui-row items-center gap-1.5">
                    <View className={`h-1.5 w-1.5 rounded-full ${live ? "bg-brand" : "bg-border"}`} />
                    <Text
                      variant={live ? "body" : "muted"}
                      className={`text-[12px] ${live ? "text-brand font-semibold" : ""}`}
                      numberOfLines={1}
                    >
                      {content}
                    </Text>
                  </View>
                  {hint ? (
                    <Text variant="muted" className="text-[10px]" numberOfLines={1}>
                      {hint}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text
                  variant="body"
                  className={`${col.key === "name" ? "font-semibold text-[13px]" : "font-mono text-[12px] tabular-nums"}`}
                  numberOfLines={1}
                >
                  {content}
                </Text>
              )}
            </View>
          );
        })}
        <View style={{ width: JOIN_W }} className="items-end">
          <View
            className={`rounded-2 px-2.5 py-1.5 ${
              canJoin && !joining ? "bg-accent-purple" : "bg-bg border border-border"
            }`}
          >
            <Text
              className={`text-[12px] font-semibold ${
                canJoin && !joining ? "text-white" : "text-muted"
              }`}
            >
              {joining ? "…" : canJoin ? "Join" : "—"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  });

  return (
    <View
      className={`border border-border rounded-2 overflow-hidden bg-panel ${
        scrollable ? "flex-1 min-h-0" : ""
      }`}
    >
      <View className="ui-row items-center border-b border-border bg-panel-elevated px-3 h-9">
        {DESKTOP_COLS.map((col) => (
          <Pressable
            key={col.key}
            onPress={() => onSort(col.key)}
            className="btn pr-2 h-9 justify-center rounded-none"
            style={{ flex: col.flex, backgroundColor: "transparent", borderRadius: 0 }}
          >
            <Text
              variant={sortKey === col.key ? "body" : "muted"}
              className={`text-[11px] tracking-wide uppercase font-semibold ${
                sortKey === col.key ? "text-gold" : ""
              }`}
              numberOfLines={1}
            >
              {col.label}
              {sortKey === col.key ? " ▾" : ""}
            </Text>
          </Pressable>
        ))}
        <View style={{ width: JOIN_W }} />
      </View>
      {scrollable ? (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          {rows}
        </ScrollView>
      ) : (
        <View>{rows}</View>
      )}
    </View>
  );
}
