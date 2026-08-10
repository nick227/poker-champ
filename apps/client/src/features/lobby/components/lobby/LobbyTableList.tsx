import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";

export type LobbySortDir = "asc" | "desc";

type Props = {
  tables: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  scrollable?: boolean;
  compact?: boolean;
};

const DESKTOP_COLS: Array<{
  key: LobbySortKey;
  label: string;
  flex: number;
  align: "left" | "right";
}> = [
  { key: "name", label: "Table", flex: 2.2, align: "left" },
  { key: "blinds", label: "Stakes", flex: 1, align: "right" },
  { key: "players", label: "Seats", flex: 0.8, align: "right" },
  { key: "buyIn", label: "Buy-in", flex: 1, align: "right" },
  { key: "status", label: "Status", flex: 1, align: "right" },
];

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

function cellTextClass(align: "left" | "right", extra = ""): string {
  return `${align === "right" ? "text-right" : "text-left"} ${extra}`.trim();
}

/** Dense inset list stage — game-client table browser. */
export function LobbyTableList({
  tables,
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
      <View className="lobby-stage border rounded-2 overflow-hidden">
        <View className="ui-row items-center border-b border-border/50 bg-panel-elevated/90 px-3 h-9">
          <Pressable
            onPress={() => onSort("name")}
            className="btn h-9 justify-center rounded-none px-1 flex-1"
            style={{ flex: 1, backgroundColor: "transparent", borderRadius: 0 }}
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
              className={`text-[11px] tracking-wide uppercase font-semibold text-right ${
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
              className={`text-[11px] tracking-wide uppercase font-semibold text-right ${
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
            const joining = isJoining(table.id);
            const live = (table.connectedHumanCount ?? 0) > 0;
            return (
              <Pressable
                key={table.id}
                onPress={() => {
                  if (!joining) onJoin(table);
                }}
                disabled={joining}
                className="btn ui-row items-center border-b border-border/40 px-3 h-12 rounded-none active:bg-panel-elevated"
                style={{ borderRadius: 0, backgroundColor: "transparent" }}
              >
                <View className="flex-1 pr-2 min-w-0">
                  <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
                    {joining ? "Joining…" : table.name}
                  </Text>
                  <Text variant="muted" className="font-mono text-[11px] tabular-nums" numberOfLines={1}>
                    {formatCents(table.smallBlindCents)}/{formatCents(table.bigBlindCents)}
                    {" · "}
                    {formatCents(table.minBuyInCents)} buy-in
                  </Text>
                </View>
                <View style={{ width: 56 }} className="items-end">
                  <Text
                    variant="body"
                    className="font-mono text-[12px] tabular-nums text-right"
                    numberOfLines={1}
                  >
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

  const header = (
    <View className="ui-row items-center border-b border-border/50 bg-panel-elevated/90 px-3 h-9">
      {DESKTOP_COLS.map((col) => (
        <Pressable
          key={col.key}
          onPress={() => onSort(col.key)}
          className={`btn h-9 justify-center rounded-none pr-2 ${
            col.align === "right" ? "items-end" : "items-start"
          }`}
          style={{ flex: col.flex, backgroundColor: "transparent", borderRadius: 0 }}
        >
          <Text
            variant={sortKey === col.key ? "body" : "muted"}
            className={cellTextClass(
              col.align,
              `text-[11px] tracking-wide uppercase font-semibold w-full ${
                sortKey === col.key ? "text-gold" : ""
              }`,
            )}
            numberOfLines={1}
          >
            {col.label}
            {caret(sortKey === col.key, sortDir)}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const rows = tables.map((table) => {
    const joining = isJoining(table.id);
    const live = (table.connectedHumanCount ?? 0) > 0;
    return (
      <Pressable
        key={table.id}
        onPress={() => {
          if (!joining) onJoin(table);
        }}
        disabled={joining}
        className="btn ui-row items-center border-b border-border/40 px-3 h-11 rounded-none active:bg-panel-elevated"
        style={{ borderRadius: 0, backgroundColor: "transparent", opacity: joining ? 0.7 : 1 }}
      >
        {DESKTOP_COLS.map((col) => {
          let content: string;
          if (col.key === "name") content = joining ? "Joining…" : table.name;
          else if (col.key === "blinds")
            content = `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
          else if (col.key === "players") content = `${table.players}/${table.seats}`;
          else if (col.key === "buyIn") content = formatCents(table.minBuyInCents);
          else content = live ? "Live" : "Waiting";

          return (
            <View
              key={col.key}
              style={{ flex: col.flex }}
              className={`pr-2 min-w-0 ${col.align === "right" ? "items-end" : "items-start"}`}
            >
              {col.key === "status" ? (
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
              ) : (
                <Text
                  variant="body"
                  className={cellTextClass(
                    col.align,
                    col.key === "name"
                      ? "font-semibold text-[13px] w-full"
                      : "font-mono text-[12px] tabular-nums w-full",
                  )}
                  numberOfLines={1}
                >
                  {content}
                </Text>
              )}
            </View>
          );
        })}
      </Pressable>
    );
  });

  return (
    <View
      className={`lobby-stage border rounded-2 overflow-hidden ${
        scrollable ? "flex-1 min-h-0" : ""
      }`}
    >
      {header}
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
