import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { LobbySortKey } from "../../lobbyTableSort";
import {
  cashLobbyCtaLabel,
  cashLobbyStatusLabel,
  resolveCashLobbyCta,
  resolveCashLobbyStatus,
} from "../../cashLobbyRow";
import { formatLobbyCount } from "../../lobbyFormat";
import type { LobbySortDir } from "./LobbyTableList";
import { cashStatusClass, cashStatusDotClass, formatCashBlinds } from "./LobbyCashDesktopRow";
import { LobbyRowCta, type LobbyRowCtaKind } from "./LobbyRowCta";

type Props = {
  tables: LobbyTableRow[];
  pinnedTables: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  onWatch?: (table: LobbyTableRow) => void;
  embedded?: boolean;
};

function caret(active: boolean, dir: LobbySortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

function cashCtaKind(cta: ReturnType<typeof resolveCashLobbyCta>): LobbyRowCtaKind {
  if (cta === "join") return "join";
  if (cta === "resume") return "resume";
  return "watch";
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
  onWatch,
  embedded = false,
}: Props) {
  return (
    <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>
      <View className="ui-row items-center border-b border-border/50 px-3 h-8">
        <Pressable
          onPress={() => onSort("name")}
          className="btn h-8 justify-center rounded-none px-1 flex-1"
          style={{ flex: 1, backgroundColor: "transparent", borderRadius: 0 }}
        >
          <Text
            variant="muted"
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
          className="btn h-8 justify-center items-end rounded-none px-1"
          style={{ width: 80, backgroundColor: "transparent", borderRadius: 0 }}
        >
          <Text
            variant="muted"
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
      ].map(({ table, pinned }, i, rows) => {
        const joining = isJoining(table.id);
        const status = resolveCashLobbyStatus(table, pinned);
        const cta = resolveCashLobbyCta(status);
        const isLast = i === rows.length - 1;
        return (
          <View
            key={`${pinned ? "pin" : "row"}-${table.id}`}
            className={`ui-row items-center px-3 ${isLast ? "" : "border-b border-border/40"} ${
              pinned ? "bg-brand-soft/70" : ""
            }`}
            style={{ height: 52 }}
          >
            <View className="flex-1 pr-2 min-w-0">
              <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
                {joining ? "Joining…" : table.name}
              </Text>
              <Text variant="muted" className="font-mono text-[11px] tabular-nums" numberOfLines={1}>
                {formatCashBlinds(table)}
              </Text>
            </View>
            <View style={{ width: 80 }} className="items-end">
              <Text variant="body" className="font-mono text-[12px] tabular-nums" numberOfLines={1}>
                {formatLobbyCount(table.players, table.seats)}
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
              <LobbyRowCta
                title={joining ? "…" : cashLobbyCtaLabel(cta, true)}
                kind={cashCtaKind(cta)}
                disabled={joining}
                onPress={() => {
                  if (cta === "resume") onResume?.(table);
                  else if (cta === "join") onJoin(table);
                  else onWatch?.(table);
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
