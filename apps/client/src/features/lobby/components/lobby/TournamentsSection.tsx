import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { TOURNAMENT } from "@/constants/copy";
import { useNowMs } from "@/hooks/useNowMs";
import { TournamentCard } from "./TournamentCard";
import { TournamentListFeedback } from "./TournamentListFeedback";
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
  onCreateTournament?: () => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
};

function SectionBlock({
  title,
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
  items: TournamentSummary[];
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <View className="ui-stack-2">
      <Text variant="label" className="text-muted uppercase tracking-wide">
        {title}
      </Text>
      <View className="flex-row flex-wrap">
        {items.map((t) => (
          <View key={t.id} className="w-full pb-3 md:w-1/2 md:px-1.5 lg:w-1/3">
            <TournamentCard
              tournament={t}
              nowMs={nowMs}
              authenticated={authenticated}
              actionInFlight={actionInFlight}
              onOpenDetail={onOpenTournamentDetail}
              onAction={onTournamentAction}
              onDelete={onDeleteTournament}
              deleteInFlight={deleteInFlightId === t.id}
            />
          </View>
        ))}
      </View>
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
  onCreateTournament,
  onDeleteTournament,
  deleteInFlightId,
}: TournamentsSectionProps) {
  const groups = groupTournamentsForLobby(filterTournamentsForBrowseLobby(tournaments));
  const hasBrowse = groups.upcoming.length > 0 || groups.running.length > 0;
  const hasJoined = selectJoinedTournaments(tournaments).length > 0;
  const nowMs = useNowMs();
  const emptyMessage = authenticated
    ? "No tournaments scheduled yet. Check back soon."
    : "No tournaments scheduled yet. Log in to register when events are posted.";

  return (
    <View className="ui-stack-4 px-4 pb-2">
      <View className="ui-row flex-wrap items-center justify-between gap-2">
        <Text variant="h2">Tournaments</Text>
        {onCreateTournament ? (
          <Button intent="accent" title={TOURNAMENT.create} size="sm" onPress={onCreateTournament} />
        ) : null}
      </View>
      <TournamentListFeedback
        busy={busy}
        error={error}
        isEmpty={!hasBrowse && !hasJoined}
        emptyMessage={emptyMessage}
        onRetry={onRetry}
      />
      {!error ? (
        <>
          <SectionBlock
            title="Upcoming"
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
