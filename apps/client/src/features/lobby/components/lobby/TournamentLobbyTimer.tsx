import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { resolveTournamentLobbyTimer } from "@/lib/tournamentLobbyTimer";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentLobbyTimerProps = {
  tournament: TournamentSummary;
  nowMs: number;
};

export function TournamentLobbyTimer({ tournament, nowMs }: TournamentLobbyTimerProps) {
  const timer = resolveTournamentLobbyTimer(tournament, nowMs);
  if (!timer) return null;

  return (
    <View className="ui-stack-1">
      <View className="ui-row flex-wrap items-baseline gap-x-2 gap-y-0">
        <Text variant="label" className="text-muted uppercase tracking-wide">
          {timer.headline}
        </Text>
        <Text variant="h2" className="text-brand tabular-nums">
          {timer.time}
        </Text>
      </View>
      {timer.detail ? (
        <Text variant="body" className="text-muted">
          {timer.detail}
        </Text>
      ) : null}
    </View>
  );
}
