import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TournamentCard } from "./TournamentCard";
import { TournamentListFeedback } from "./TournamentListFeedback";
import { groupTournamentsForLobby } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentsSectionProps = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onRetry?: () => void;
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
  onRetry,
}: TournamentsSectionProps) {
  const groups = groupTournamentsForLobby(tournaments);
  const hasAny =
    groups.upcoming.length > 0 || groups.running.length > 0 || groups.recent.length > 0;
  const emptyMessage = authenticated
    ? "No tournaments scheduled yet. Check back soon."
    : "No tournaments scheduled yet. Log in to register when events are posted.";

  return (
    <View className="ui-stack-4 px-4 pb-2">
      <Text variant="h2">Tournaments</Text>
      <TournamentListFeedback
        busy={busy}
        error={error}
        isEmpty={!hasAny}
        emptyMessage={emptyMessage}
        onRetry={onRetry}
      />
      {!error ? (
        <>
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
        </>
      ) : null}
    </View>
  );
}
