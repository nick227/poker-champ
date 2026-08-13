import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";
import { CASH_COL_FLEX, LobbyCashDesktopRow } from "./LobbyCashDesktopRow";
import { LobbyTableListCompact } from "./LobbyTableListCompact";

export type LobbySortDir = "asc" | "desc";

type Props = {
  tables: LobbyTableRow[];
  pinnedTables?: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  scrollable?: boolean;
  compact?: boolean;
  embedded?: boolean;
};

const DESKTOP_COLS: Array<{
  key: LobbySortKey;
  label: string;
  flex: number;
  align: "left" | "right";
}> = [
  { key: "name", label: "Table", flex: CASH_COL_FLEX.name, align: "left" },
  { key: "blinds", label: "Stakes", flex: CASH_COL_FLEX.blinds, align: "right" },
  { key: "players", label: "Players", flex: CASH_COL_FLEX.players, align: "right" },
  { key: "avgPot", label: "Avg Pot", flex: CASH_COL_FLEX.avgPot, align: "right" },
  { key: "status", label: "Status", flex: CASH_COL_FLEX.status, align: "right" },
];

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

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
  embedded = false,
}: Props) {
  if (compact) {
    return (
      <LobbyTableListCompact
        tables={tables}
        pinnedTables={pinnedTables}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        isJoining={isJoining}
        onJoin={onJoin}
        onResume={onResume}
        embedded={embedded}
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
            className={`${col.align === "right" ? "text-right" : "text-left"} text-[11px] tracking-wide uppercase font-semibold w-full ${
              sortKey === col.key ? "text-gold" : ""
            }`}
            numberOfLines={1}
          >
            {col.label}
            {caret(sortKey === col.key, sortDir)}
          </Text>
        </Pressable>
      ))}
      <View style={{ flex: CASH_COL_FLEX.action }} />
    </View>
  );

  const body = (
    <>
      {pinnedTables.map((table) => (
        <LobbyCashDesktopRow
          key={`pin-${table.id}`}
          table={table}
          pinned
          joining={isJoining(table.id)}
          onJoin={onJoin}
          onResume={onResume}
        />
      ))}
      {tables.map((table) => (
        <LobbyCashDesktopRow
          key={table.id}
          table={table}
          pinned={false}
          joining={isJoining(table.id)}
          onJoin={onJoin}
          onResume={onResume}
        />
      ))}
    </>
  );

  return (
    <View
      className={
        embedded
          ? scrollable
            ? "flex-1 min-h-0"
            : ""
          : `lobby-stage border rounded-2 overflow-hidden ${scrollable ? "flex-1 min-h-0" : ""}`
      }
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
