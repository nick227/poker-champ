import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { TournamentSummary } from "@/services/tournaments.types";
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
};

function HeaderCell({
  label,
  flex,
}: {
  label: string;
  flex: number;
}) {
  return (
    <Text
      variant="muted"
      className="text-[11px] tracking-wide uppercase font-semibold pr-2"
      numberOfLines={1}
      style={{ flex }}
    >
      {label}
    </Text>
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
    return <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>{rows}</View>;
  }

  return (
    <View className={embedded ? "" : "lobby-stage border rounded-2 overflow-hidden"}>
      <View className="ui-row items-center border-b border-border/50 px-3 h-8">
        <HeaderCell label="Tournament" flex={TOURNEY_COL_FLEX.event} />
        <HeaderCell label="Buy-in" flex={TOURNEY_COL_FLEX.entry} />
        <HeaderCell label="Enrolled" flex={TOURNEY_COL_FLEX.field} />
        <HeaderCell label="Starts / Started" flex={TOURNEY_COL_FLEX.starts} />
        <HeaderCell label="Late Reg Open" flex={TOURNEY_COL_FLEX.lateReg} />
        <HeaderCell label="Status" flex={TOURNEY_COL_FLEX.status} />
        <View style={{ flex: TOURNEY_COL_FLEX.action }} />
      </View>
      {rows}
    </View>
  );
}
