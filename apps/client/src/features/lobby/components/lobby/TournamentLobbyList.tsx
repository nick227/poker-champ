import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { TournamentSummary } from "@/services/tournaments.types";
import { lobbySortCaret, type LobbySortDir } from "../../lobbyTableSort";
import type { TournamentSortKey } from "../../tournamentLobbySort";
import { TournamentLobbyRow, TOURNEY_COL_FLEX } from "./TournamentLobbyRow";

type Props = {
  tournaments: TournamentSummary[];
  pinnedTournaments?: TournamentSummary[];
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
  compact?: boolean;
  embedded?: boolean;
  sortKey?: TournamentSortKey;
  sortDir?: LobbySortDir;
  onSort?: (key: TournamentSortKey) => void;
};

const DESKTOP_COLS: Array<{ key: TournamentSortKey; label: string; flex: number }> = [
  { key: "name", label: "Tournament", flex: TOURNEY_COL_FLEX.event },
  { key: "buyIn", label: "Buy-in", flex: TOURNEY_COL_FLEX.entry },
  { key: "enrolled", label: "Enrolled", flex: TOURNEY_COL_FLEX.field },
  { key: "startTime", label: "Starts / Started", flex: TOURNEY_COL_FLEX.starts },
  { key: "lateReg", label: "Late Reg", flex: TOURNEY_COL_FLEX.lateReg },
  { key: "status", label: "Status", flex: TOURNEY_COL_FLEX.status },
];

function HeaderCell({
  label,
  flex,
  active,
  dir,
  onPress,
}: {
  label: string;
  flex: number;
  active: boolean;
  dir: LobbySortDir;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="btn h-8 justify-center items-start rounded-none pr-2"
      style={{ flex, backgroundColor: "transparent", borderRadius: 0 }}
    >
      <Text
        variant="muted"
        className={`text-left text-[11px] tracking-wide uppercase font-semibold w-full ${
          active ? "text-gold" : ""
        }`}
        numberOfLines={1}
      >
        {label}
        {onPress ? lobbySortCaret(active, dir) : ""}
      </Text>
    </Pressable>
  );
}

export function TournamentLobbyList({
  tournaments,
  pinnedTournaments = [],
  nowMs,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
  onDelete,
  deleteInFlightId,
  compact = false,
  embedded = false,
  sortKey = "startTime",
  sortDir = "asc",
  onSort,
}: Props) {
  const rows = (
    <>
      {pinnedTournaments.map((tournament, i) => (
        <TournamentLobbyRow
          key={`pin-${tournament.id}`}
          tournament={tournament}
          pinned
          nowMs={nowMs}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          compact={compact}
          isLast={i === pinnedTournaments.length - 1 && tournaments.length === 0}
          onOpenDetail={onOpenDetail}
          onAction={onAction}
          onDelete={onDelete}
          deleteInFlightId={deleteInFlightId}
        />
      ))}
      {tournaments.map((tournament, i) => (
        <TournamentLobbyRow
          key={tournament.id}
          tournament={tournament}
          pinned={false}
          nowMs={nowMs}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          compact={compact}
          isLast={i === tournaments.length - 1}
          onOpenDetail={onOpenDetail}
          onAction={onAction}
          onDelete={onDelete}
          deleteInFlightId={deleteInFlightId}
        />
      ))}
    </>
  );

  if (compact) {
    return (
      <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>
        <View className="ui-row items-center border-b border-border/50 px-3 h-8">
          <HeaderCell
            label="Tournament"
            flex={1}
            active={sortKey === "name"}
            dir={sortDir}
            onPress={onSort ? () => onSort("name") : undefined}
          />
          <HeaderCell
            label="Starts"
            flex={1}
            active={sortKey === "startTime"}
            dir={sortDir}
            onPress={onSort ? () => onSort("startTime") : undefined}
          />
          <View style={{ width: 72 }} />
        </View>
        {rows}
      </View>
    );
  }

  return (
    <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>
      <View className="ui-row items-center border-b border-border/50 px-3 h-8">
        {DESKTOP_COLS.map((col) => (
          <HeaderCell
            key={col.key}
            label={col.label}
            flex={col.flex}
            active={sortKey === col.key}
            dir={sortDir}
            onPress={onSort ? () => onSort(col.key) : undefined}
          />
        ))}
        <View style={{ flex: TOURNEY_COL_FLEX.action }} />
      </View>
      {rows}
    </View>
  );
}
