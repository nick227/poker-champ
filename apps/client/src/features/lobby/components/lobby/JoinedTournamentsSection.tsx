import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TournamentCard } from "./TournamentCard";
import { selectJoinedTournaments } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { JoinedTournamentCard } from "./JoinedTournamentCard";

type JoinedTournamentsSectionProps = {
  tournaments: TournamentSummary[];
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
};

export function JoinedTournamentsSection({
  tournaments,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
  onDeleteTournament,
  deleteInFlightId,
}: JoinedTournamentsSectionProps) {
  if (!authenticated) return null;

  const joined = selectJoinedTournaments(tournaments);
  if (joined.length === 0) return null;

  return (
    <View className="ui-stack-4 px-4 pb-2">
      <View className="ui-stack-1">
        <Text variant="h2">Your tournaments</Text>
        <Text variant="muted" className="text-sm">
          Scheduled, live, and your recent results — including cancelled events.
        </Text>
      </View>
      <View className="ui-stack-3">
        {joined.map((t) => (
          <JoinedTournamentCard
            key={t.id}
            tournament={t}
            authenticated={authenticated}
            actionInFlight={actionInFlight}
            onOpenDetail={onOpenTournamentDetail}
            onAction={onTournamentAction}
          />
        ))}
      </View>
    </View>
  );
}
