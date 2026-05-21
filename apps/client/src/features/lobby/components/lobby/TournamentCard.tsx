import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { formatCents } from "@/lib/format";
import {
  formatTournamentStartLocal,
  formatTournamentStatus,
  resolveTournamentCta,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentCardProps = {
  tournament: TournamentSummary;
  authenticated: boolean;
  onAction: (tournament: TournamentSummary) => void;
};

export function TournamentCard({ tournament, authenticated, onAction }: TournamentCardProps) {
  const cta = resolveTournamentCta(tournament, { authenticated });

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <View className="ui-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text variant="h2" numberOfLines={2}>
              {tournament.name}
            </Text>
            <Text variant="body" className="text-muted">
              {formatTournamentStartLocal(tournament.startTime)}
            </Text>
          </View>
          <Text variant="label" className="text-brand">
            {formatTournamentStatus(tournament.status)}
          </Text>
        </View>
        <View className="ui-row flex-wrap gap-3">
          <Text variant="body">Entry {formatCents(tournament.entryFeeCents)}</Text>
          <Text variant="body">
            {tournament.registeredCount}/{tournament.maxPlayers} registered
          </Text>
        </View>
        <Button
          title={cta.label}
          intent={cta.action === "unregister" ? "neutral" : "primary"}
          size="sm"
          disabled={cta.disabled}
          onPress={() => onAction(tournament)}
        />
      </View>
    </Surface>
  );
}
