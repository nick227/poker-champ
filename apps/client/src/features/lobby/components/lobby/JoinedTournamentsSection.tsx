import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TournamentCard } from "./TournamentCard";
import { formatJoinedTournamentHint, selectJoinedTournaments } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type JoinedTournamentsSectionProps = {
  tournaments: TournamentSummary[];
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
};

export function JoinedTournamentsSection({
  tournaments,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
}: JoinedTournamentsSectionProps) {
  if (!authenticated) return null;

  const joined = selectJoinedTournaments(tournaments);
  if (joined.length === 0) return null;

  return (
    <View className="ui-stack-4 px-4 pb-2">
      <View className="ui-stack-1">
        <Text variant="h2">Your tournaments</Text>
        <Text variant="muted" className="text-sm">
          Scheduled and live events you are registered for.
        </Text>
      </View>
      <View className="ui-stack-3">
        {joined.map((t) => (
          <TournamentCard
            key={t.id}
            tournament={t}
            authenticated={authenticated}
            actionInFlight={actionInFlight}
            statusHint={formatJoinedTournamentHint(t)}
            onOpenDetail={onOpenTournamentDetail}
            onAction={onTournamentAction}
          />
        ))}
      </View>
    </View>
  );
}
