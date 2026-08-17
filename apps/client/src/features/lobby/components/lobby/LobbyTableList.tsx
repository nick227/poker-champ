import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { lobbySortCaret, type LobbySortDir, type LobbySortKey } from "../../lobbyTableSort";
import { CASH_COL_FLEX, LobbyCashDesktopRow } from "./LobbyCashDesktopRow";
import { LobbyTableListCompact } from "./LobbyTableListCompact";

export type { LobbySortDir };

type Props = {
  tables: LobbyTableRow[];
  pinnedTables?: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  onWatch?: (table: LobbyTableRow) => void;
  scrollable?: boolean;
  compact?: boolean;
  embedded?: boolean;
};

const DESKTOP_COLS: Array<{
  key: LobbySortKey;
  label: string;
  flex: number;
  sortable: boolean;
}> = [
  { key: "name", label: "Table", flex: CASH_COL_FLEX.name, sortable: true },
  { key: "blinds", label: "Stakes", flex: CASH_COL_FLEX.blinds, sortable: true },
  { key: "players", label: "Players", flex: CASH_COL_FLEX.players, sortable: true },
  { key: "status", label: "Status", flex: CASH_COL_FLEX.status, sortable: true },
];

export function LobbyTableList({
  tables,
  pinnedTables = [],
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onJoin,
  onResume,
  onWatch,
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
        onWatch={onWatch}
        embedded={embedded}
      />
    );
  }

  const header = (
    <View className="ui-row items-center border-b border-border/70 px-4 h-9">
      {DESKTOP_COLS.map((col) => (
        <Pressable
          key={col.key}
          onPress={() => {
            onSort(col.key);
          }}
          disabled={!col.sortable}
          className="h-8 justify-center items-start pr-2"
          style={{ flex: col.flex, backgroundColor: "transparent", borderRadius: 0 }}
        >
          {col.label ? (
            <Text
              variant="muted"
              className={`text-left text-[11px] tracking-wide uppercase font-semibold w-full ${
                sortKey === col.key ? "text-brand" : ""
              }`}
              numberOfLines={1}
            >
              {col.label}
              {col.sortable ? lobbySortCaret(sortKey === col.key, sortDir) : ""}
            </Text>
          ) : null}
        </Pressable>
      ))}
      <View style={{ flex: CASH_COL_FLEX.action }} />
    </View>
  );

  const body = (
    <>
      {pinnedTables.map((table, i) => (
        <LobbyCashDesktopRow
          key={`pin-${table.id}`}
          table={table}
          pinned
          joining={isJoining(table.id)}
          isLast={i === pinnedTables.length - 1 && tables.length === 0}
          onJoin={onJoin}
          onResume={onResume}
          onWatch={onWatch}
        />
      ))}
      {tables.map((table, i) => (
        <LobbyCashDesktopRow
          key={table.id}
          table={table}
          pinned={false}
          joining={isJoining(table.id)}
          isLast={i === tables.length - 1}
          onJoin={onJoin}
          onResume={onResume}
          onWatch={onWatch}
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
