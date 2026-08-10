import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import {
  formatCashLobbyJoinHint,
  resolveCashLobbyJoin,
  type LobbyTableRow,
} from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";

export type LobbySortDir = "asc" | "desc";

type Props = {
  tables: LobbyTableRow[];
  balanceCents: number;
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  scrollable?: boolean;
  compact?: boolean;
};

const JOIN_W = 88;

const DESKTOP_COLS: Array<{
  key: LobbySortKey;
  label: string;
  flex: number;
  align: "left" | "right";
}> = [
  { key: "name", label: "Table", flex: 1.6, align: "left" },
  { key: "blinds", label: "Stakes", flex: 1, align: "right" },
  { key: "players", label: "Seats", flex: 0.7, align: "right" },
  { key: "buyIn", label: "Buy-in", flex: 0.9, align: "right" },
  { key: "status", label: "Status", flex: 0.9, align: "right" },
];

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

/** Dense inset list stage — game-client table browser. */
export function LobbyTableList({
  tables,
  balanceCents,
  sortKey,
  sortDir,
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
          <Pressable
            onPress={() => onSort("name")}
            className="btn h-9 justify-center rounded-none px-1 flex-1"
            style={{ backgroundColor: "transparent", borderRadius: 0 }}
          >
            <Text
              variant={sortKey === "name" ? "body" : "muted"}
              className={`text-[11px] tracking-wide uppercase font-semibold ${
                sortKey === "name" ? "text-gold" : ""
              }`}
              numberOfLines={1}
            >
              Table{caret(sortKey === "name", sortDir)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onSort("players")}
            className="btn h-9 justify-center items-end rounded-none px-1"
            style={{ width: 56, backgroundColor: "transparent", borderRadius: 0 }}
          >
            <Text
              variant={sortKey === "players" ? "body" : "muted"}
              className={`text-[11px] tracking-wide uppercase font-semibold ${
                sortKey === "players" ? "text-gold" : ""
              }`}
              numberOfLines={1}
            >
              Seats{caret(sortKey === "players", sortDir)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onSort("status")}
            className="btn h-9 justify-center items-end rounded-none px-1"
            style={{ width: 72, backgroundColor: "transparent", borderRadius: 0 }}
          >
            <Text
              variant={sortKey === "status" ? "body" : "muted"}
              className={`text-[11px] tracking-wide uppercase font-semibold ${
                sortKey === "status" ? "text-gold" : ""
              }`}
              numberOfLines={1}
            >
              Status{caret(sortKey === "status", sortDir)}
            </Text>
          </Pressable>
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
                style={{
                  borderRadius: 0,
                  backgroundColor: "transparent",
                  opacity: canJoin || joining ? 1 : 0.75,
                }}
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
                <View style={{ width: 56 }} className="items-end">
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
      <View
        key={table.id}
        className={`ui-row items-center border-b border-border/40 px-3 min-h-[44px] py-1.5 ${
          canJoin ? "" : "opacity-75"
        }`}
      >
        {DESKTOP_COLS.map((col) => {
          let content: string;
          if (col.key === "name") content = table.name;
          else if (col.key === "blinds")
            content = `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
          else if (col.key === "players") content = `${table.players}/${table.seats}`;
          else if (col.key === "buyIn") content = formatCents(table.minBuyInCents);
          else content = live ? "Live" : "Waiting";

          const alignClass = col.align === "right" ? "items-end" : "items-start";
          return (
            <View key={col.key} style={{ flex: col.flex }} className={`pr-2 ${alignClass}`}>
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
                    <Text variant="muted" className="text-[11px] text-warn" numberOfLines={1}>
                      {hint}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text
                  variant="body"
                  className={`${
                    col.key === "name"
                      ? "font-semibold text-[13px]"
                      : "font-mono text-[12px] tabular-nums"
                  }`}
                  numberOfLines={1}
                >
                  {content}
                </Text>
              )}
            </View>
          );
        })}
        <View style={{ width: JOIN_W }} className="items-end">
          <Button
            title={joining ? "…" : canJoin ? "Join" : "—"}
            intent={canJoin ? "accent" : "neutral"}
            size="sm"
            shape="hud"
            minWidth={0}
            disabled={joining || !canJoin}
            onPress={() => onJoin(table)}
            className="min-h-[32px] px-3"
          />
        </View>
      </View>
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
            className={`btn pr-2 h-9 justify-center rounded-none ${
              col.align === "right" ? "items-end" : "items-start"
            }`}
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
              {caret(sortKey === col.key, sortDir)}
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
