import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { formatCents } from "@/lib/format";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import type { TournamentStandingRow } from "@/services/tournaments.types";

type TournamentStandingsSectionProps = {
  title?: string;
  rows: TournamentStandingRow[];
  busy: boolean;
  error: string | null;
  showPayouts?: boolean;
};

export function TournamentStandingsSection({
  title = "Standings",
  rows,
  busy,
  error,
  showPayouts = true,
}: TournamentStandingsSectionProps) {
  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <Text variant="h2">{title}</Text>
        {busy ? <ActivityIndicator /> : null}
        {error ? <Text variant="danger">{mapTournamentApiError(error)}</Text> : null}
        {!busy && !error && rows.length === 0 ? (
          <Text variant="muted">No players listed yet.</Text>
        ) : null}
        {!busy && !error
          ? rows.map((row) => (
              <View
                key={row.userId}
                className="ui-row items-center justify-between border-b border-border py-2"
              >
                <View className="flex-1 min-w-0 pr-2">
                  <Text variant="body" numberOfLines={1}>
                    {row.finishPlace != null ? `#${row.finishPlace} ` : "• "}
                    {row.displayName}
                  </Text>
                </View>
                {showPayouts ? (
                  <Text variant="body" className="text-brand shrink-0">
                    {row.payoutCents > 0 ? formatCents(row.payoutCents) : "—"}
                  </Text>
                ) : null}
              </View>
            ))
          : null}
      </View>
    </Surface>
  );
}
