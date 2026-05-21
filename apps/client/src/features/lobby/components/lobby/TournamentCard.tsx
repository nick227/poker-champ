import { Pressable, View } from "react-native";
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
  actionInFlight?: boolean;
  statusHint?: string;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
};

export function TournamentCard({
  tournament,
  authenticated,
  actionInFlight,
  statusHint,
  onOpenDetail,
  onAction,
}: TournamentCardProps) {
  const cta = resolveTournamentCta(tournament, { authenticated });
  const disabled = cta.disabled || actionInFlight;

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
          <View className="ui-stack-2">
            <View className="ui-row flex-wrap items-start justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text variant="h2" numberOfLines={2}>
                  {tournament.name}
                </Text>
              </View>
              <Text variant="label" className="text-brand shrink-0">
                {formatTournamentStatus(tournament.status)}
              </Text>
            </View>
            <Text variant="body" className="text-muted">
              {statusHint ?? `Starts ${formatTournamentStartLocal(tournament.startTime)}`}
            </Text>
            <View className="ui-row flex-wrap gap-x-3 gap-y-1">
              <Text variant="body">Entry {formatCents(tournament.entryFeeCents)}</Text>
              <Text variant="body">
                {tournament.registeredCount}/{tournament.maxPlayers} registered
              </Text>
            </View>
          </View>
          <Pressable onPress={() => onOpenDetail(tournament)} accessibilityRole="button">
            ABOUT
        </Pressable>
        <Button
          title={actionInFlight ? "Please wait…" : cta.label}
          intent={cta.action === "unregister" ? "neutral" : "primary"}
          size="sm"
          className="w-full"
          disabled={disabled}
          onPress={() => onAction(tournament)}
        />
      </View>
    </Surface>
  );
}
