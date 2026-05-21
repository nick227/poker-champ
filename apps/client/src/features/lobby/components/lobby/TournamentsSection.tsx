import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TournamentCard } from "./TournamentCard";
import { GameTablePanelSkeleton } from "./GameTablePanelSkeleton";
import { groupTournamentsForLobby } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentsSectionProps = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
};

function SectionBlock({
  title,
  items,
  authenticated,
  actionInFlight,
  onTournamentAction,
}: {
  title: string;
  items: TournamentSummary[];
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View className="ui-stack-3">
      <Text variant="label" className="text-muted uppercase tracking-wide">
        {title}
      </Text>
      {items.map((t) => (
        <TournamentCard
          key={t.id}
          tournament={t}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          onAction={onTournamentAction}
        />
      ))}
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
}: TournamentsSectionProps) {
  const groups = groupTournamentsForLobby(tournaments);
  const hasAny =
    groups.upcoming.length > 0 || groups.running.length > 0 || groups.recent.length > 0;

  return (
    <View className="ui-stack-4 px-4 pb-2">
      <Text variant="h2">Tournaments</Text>
      {busy && !hasAny ? (
        <>
          <GameTablePanelSkeleton />
          <GameTablePanelSkeleton />
        </>
      ) : null}
      {error ? (
        <Text variant="danger">{error}</Text>
      ) : null}
      {!busy && !error && !hasAny ? (
        <Text variant="body" className="text-muted">
          No tournaments scheduled yet.
        </Text>
      ) : null}
      <SectionBlock
        title="Upcoming"
        items={groups.upcoming}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onTournamentAction={onTournamentAction}
      />
      <SectionBlock
        title="Running"
        items={groups.running}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onTournamentAction={onTournamentAction}
      />
      <SectionBlock
        title="Recent"
        items={groups.recent}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onTournamentAction={onTournamentAction}
      />
    </View>
  );
}
