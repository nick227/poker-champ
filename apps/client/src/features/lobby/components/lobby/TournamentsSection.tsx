import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { useNowMs } from "@/hooks/useNowMs";
import { TournamentListFeedback } from "./TournamentListFeedback";
import { TournamentLobbyList } from "./TournamentLobbyList";
import {
  filterTournamentsForBrowseLobby,
  groupTournamentsForLobby,
  selectJoinedTournaments,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentsSectionProps = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onRetry?: () => void;
  onCreate?: () => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
  dense?: boolean;
};

function isRunningPhase(status: string): boolean {
  return status === "STARTING" || status === "LATE_REG" || status === "RUNNING";
}

function SectionBlock({
  title,
  pinned,
  items,
  nowMs,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
  onDeleteTournament,
  deleteInFlightId,
}: {
  title: string;
  pinned: TournamentSummary[];
  items: TournamentSummary[];
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
}) {
  if (pinned.length === 0 && items.length === 0) return null;
  return (
    <View className="ui-stack-2">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        {title}
      </Text>
      <TournamentLobbyList
        pinnedTournaments={pinned}
        tournaments={items}
        nowMs={nowMs}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onOpenDetail={onOpenTournamentDetail}
        onAction={onTournamentAction}
        onDelete={onDeleteTournament}
        deleteInFlightId={deleteInFlightId}
      />
    </View>
  );
}

export function TournamentsSection({
  tournaments,
  busy,
  error,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
  onRetry,
  onCreate,
  onDeleteTournament,
  deleteInFlightId,
  dense = false,
}: TournamentsSectionProps) {
  const joined = authenticated ? selectJoinedTournaments(tournaments) : [];
  const groups = groupTournamentsForLobby(filterTournamentsForBrowseLobby(tournaments));

  const pinnedUpcomingBase = joined.filter((t) => t.status === "REGISTERING");
  const pinnedRunningBase = joined.filter((t) => isRunningPhase(t.status));
  const leftover = joined.filter(
    (t) => t.status !== "REGISTERING" && !isRunningPhase(t.status),
  );
  const preferRunning =
    groups.running.length > 0 || pinnedRunningBase.length > 0 || leftover.length > 0;
  const pinnedUpcoming = preferRunning
    ? pinnedUpcomingBase
    : [...leftover, ...pinnedUpcomingBase];
  const pinnedRunning = preferRunning
    ? [...leftover, ...pinnedRunningBase]
    : pinnedRunningBase;

  const hasRows =
    pinnedUpcoming.length > 0 ||
    pinnedRunning.length > 0 ||
    groups.upcoming.length > 0 ||
    groups.running.length > 0;
  const nowMs = useNowMs();
  const emptyMessage = authenticated
    ? "No tournaments scheduled yet. Create one or check back soon."
    : "No tournaments scheduled yet. Log in to register when events are posted.";

  return (
    <View className={`ui-stack-3 pb-2 ${dense ? "" : "px-4"}`}>
      <TournamentListFeedback
        busy={busy}
        error={error}
        isEmpty={!hasRows}
        emptyMessage={emptyMessage}
        onRetry={onRetry}
        onCreate={authenticated ? onCreate : undefined}
      />
      {!error ? (
        <>
          <SectionBlock
            title="Upcoming"
            pinned={pinnedUpcoming}
            items={groups.upcoming}
            nowMs={nowMs}
            authenticated={authenticated}
            actionInFlight={actionInFlight}
            onTournamentAction={onTournamentAction}
            onOpenTournamentDetail={onOpenTournamentDetail}
            onDeleteTournament={onDeleteTournament}
            deleteInFlightId={deleteInFlightId}
          />
          <SectionBlock
            title="Running"
            pinned={pinnedRunning}
            items={groups.running}
            nowMs={nowMs}
            authenticated={authenticated}
            actionInFlight={actionInFlight}
            onTournamentAction={onTournamentAction}
            onOpenTournamentDetail={onOpenTournamentDetail}
            onDeleteTournament={onDeleteTournament}
            deleteInFlightId={deleteInFlightId}
          />
        </>
      ) : null}
    </View>
  );
}
