import { Pressable, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";
import {
  cashLobbyCtaLabel,
  cashLobbyStatusLabel,
  resolveCashLobbyCta,
  resolveCashLobbyStatus,
} from "../../cashLobbyRow";
import type { LobbySortDir } from "./LobbyTableList";
import { cashStatusClass, cashStatusDotClass, formatCashBlinds } from "./LobbyCashDesktopRow";

type Props = {
  tables: LobbyTableRow[];
  pinnedTables: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  embedded?: boolean;
};

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

export function LobbyTableListCompact({
  tables,
  pinnedTables,
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onJoin,
  onResume,
  embedded = false,
}: Props) {
  return (
    <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>
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
        <View style={{ width: 72 }} />
      </View>
      {[
        ...pinnedTables.map((t) => ({ table: t, pinned: true })),
        ...tables.map((t) => ({ table: t, pinned: false })),
      ].map(({ table, pinned }) => {
        const joining = isJoining(table.id);
        const status = resolveCashLobbyStatus(table, pinned);
        const cta = resolveCashLobbyCta(status);
        const ctaEnabled = cta !== "view" && !joining;
        return (
          <View
            key={`${pinned ? "pin" : "row"}-${table.id}`}
            className={`ui-row items-center border-b border-border/40 px-3 h-14 ${
              pinned ? "bg-brand-soft border-brand/25" : ""
            }`}
          >
            <View className="flex-1 pr-2 min-w-0">
              <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
                {joining ? "Joining…" : table.name}
              </Text>
              <Text variant="muted" className="font-mono text-[11px] tabular-nums" numberOfLines={1}>
                {formatCashBlinds(table)}
              </Text>
            </View>
            <View style={{ width: 56 }} className="items-end">
              <Text variant="body" className="font-mono text-[12px] tabular-nums" numberOfLines={1}>
                {table.seats > 0 ? `${table.players}/${table.seats}` : "—"}
              </Text>
              <View className="ui-row items-center gap-1 mt-0.5">
                <View className={`h-1.5 w-1.5 rounded-full ${cashStatusDotClass(status)}`} />
                <Text
                  variant="body"
                  className={`text-[10px] ${cashStatusClass(status)}`}
                  numberOfLines={1}
                >
                  {cashLobbyStatusLabel(status, table.waitlistCount)}
                </Text>
              </View>
            </View>
            <View style={{ width: 72 }} className="items-end pl-2">
              <Button
                title={joining ? "…" : cashLobbyCtaLabel(cta, true)}
                onPress={() => {
                  if (cta === "resume") onResume?.(table);
                  else if (cta === "join") onJoin(table);
                }}
                disabled={!ctaEnabled}
                intent={cta === "join" ? "ghost" : "neutral"}
                size="sm"
                shape="hud"
                minWidth={0}
                className={
                  cta === "join"
                    ? "h-8 min-h-[32px] px-2 border border-brand bg-transparent"
                    : "h-8 min-h-[32px] px-2"
                }
                textClassName={cta === "join" ? "text-brand" : ""}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
