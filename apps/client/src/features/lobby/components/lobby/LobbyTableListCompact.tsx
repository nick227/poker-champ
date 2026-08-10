import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";
import type { LobbySortDir } from "./LobbyTableList";

type Props = {
  tables: LobbyTableRow[];
  pinnedTables: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onRowPress: (table: LobbyTableRow, pinned: boolean) => void;
};

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

function formatBlinds(table: LobbyTableRow): string {
  if (table.smallBlindCents <= 0 && table.bigBlindCents <= 0) return "—";
  return `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
}

function formatSeats(table: LobbyTableRow): string {
  if (table.seats <= 0) return "—";
  return `${table.players}/${table.seats}`;
}

/** Compact (mobile) cash lobby rows. */
export function LobbyTableListCompact({
  tables,
  pinnedTables,
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onRowPress,
}: Props) {
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
        {[
          ...pinnedTables.map((t) => ({ table: t, pinned: true })),
          ...tables.map((t) => ({ table: t, pinned: false })),
        ].map(({ table, pinned }) => {
          const joining = isJoining(table.id);
          const live = (table.connectedHumanCount ?? 0) > 0;
          return (
            <Pressable
              key={`${pinned ? "pin" : "row"}-${table.id}`}
              onPress={() => onRowPress(table, pinned)}
              disabled={joining}
              className={`btn ui-row items-center border-b border-border/40 px-3 h-12 rounded-none ${
                pinned ? "bg-brand-soft border-brand/25" : "active:bg-panel-elevated"
              }`}
              style={{ borderRadius: 0 }}
            >
              <View className="flex-1 pr-2 min-w-0">
                <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
                  {joining ? "Joining…" : table.name}
                </Text>
                <Text variant="muted" className="font-mono text-[11px] tabular-nums" numberOfLines={1}>
                  {formatBlinds(table)}
                  {" · "}
                  {table.minBuyInCents > 0 ? `${formatCents(table.minBuyInCents)} buy-in` : "—"}
                </Text>
              </View>
              <View style={{ width: 56 }} className="items-end">
                <Text
                  variant="body"
                  className="font-mono text-[12px] tabular-nums text-right"
                  numberOfLines={1}
                >
                  {formatSeats(table)}
                </Text>
              </View>
              <View style={{ width: 72 }} className="items-end">
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
                    {pinned ? "Joined" : live ? "Live" : "Wait"}
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
