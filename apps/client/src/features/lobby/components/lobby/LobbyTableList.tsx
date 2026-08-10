import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";
import { LobbyTableListCompact } from "./LobbyTableListCompact";

export type LobbySortDir = "asc" | "desc";

type Props = {
  tables: LobbyTableRow[];
  /** Frozen session rows rendered above browse rows (status Joined). */
  pinnedTables?: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
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

function formatBlinds(table: LobbyTableRow): string {
  if (table.smallBlindCents <= 0 && table.bigBlindCents <= 0) return "—";
  return `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
}

function formatSeats(table: LobbyTableRow): string {
  if (table.seats <= 0) return "—";
  return `${table.players}/${table.seats}`;
}

function DesktopRow({
  table,
  pinned,
  joining,
  onPress,
}: {
  table: LobbyTableRow;
  pinned: boolean;
  joining: boolean;
  onPress: () => void;
}) {
  const live = (table.connectedHumanCount ?? 0) > 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={joining}
      className={`btn ui-row items-center border-b border-border/40 px-3 h-11 rounded-none ${
        pinned ? "bg-brand-soft border-brand/25" : "active:bg-panel-elevated"
      }`}
      style={{ borderRadius: 0, opacity: joining ? 0.7 : 1 }}
    >
      {DESKTOP_COLS.map((col) => {
        let content: string;
        if (col.key === "name") content = joining ? "Joining…" : table.name;
        else if (col.key === "blinds") content = formatBlinds(table);
        else if (col.key === "players") content = formatSeats(table);
        else if (col.key === "buyIn")
          content = table.minBuyInCents > 0 ? formatCents(table.minBuyInCents) : "—";
        else content = pinned ? "Joined" : live ? "Live" : "Waiting";

        return (
          <View
            key={col.key}
            style={{ flex: col.flex }}
            className={`pr-2 min-w-0 ${col.align === "right" ? "items-end" : "items-start"}`}
          >
            {col.key === "status" ? (
              <View className="ui-row items-center gap-1.5">
                <View
                  className={`h-1.5 w-1.5 rounded-full ${
                    pinned || live ? "bg-brand" : "bg-border"
                  }`}
                />
                <Text
                  variant="body"
                  className={`text-[12px] ${
                    pinned || live ? "text-brand font-semibold" : "text-muted"
                  }`}
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
}

/** Dense inset list stage — game-client table browser. */
export function LobbyTableList({
  tables,
  pinnedTables = [],
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onJoin,
  onResume,
  scrollable = true,
  compact = false,
}: Props) {
  const handleRowPress = (table: LobbyTableRow, pinned: boolean) => {
    if (isJoining(table.id)) return;
    if (pinned) {
      onResume?.(table);
      return;
    }
    onJoin(table);
  };

  if (compact) {
    return (
      <LobbyTableListCompact
        tables={tables}
        pinnedTables={pinnedTables}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        isJoining={isJoining}
        onRowPress={handleRowPress}
      />
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

  const body = (
    <>
      {pinnedTables.map((table) => (
        <DesktopRow
          key={`pin-${table.id}`}
          table={table}
          pinned
          joining={isJoining(table.id)}
          onPress={() => handleRowPress(table, true)}
        />
      ))}
      {tables.map((table) => (
        <DesktopRow
          key={table.id}
          table={table}
          pinned={false}
          joining={isJoining(table.id)}
          onPress={() => handleRowPress(table, false)}
        />
      ))}
    </>
  );

  return (
    <View
      className={`lobby-stage border rounded-2 overflow-hidden ${
        scrollable ? "flex-1 min-h-0" : ""
      }`}
    >
      {header}
      {scrollable ? (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          {body}
        </ScrollView>
      ) : (
        <View>{body}</View>
      )}
    </View>
  );
}
