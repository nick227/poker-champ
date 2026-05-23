import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import {
  formatTournamentStandingPayout,
  formatTournamentStandingStatus,
  resolveTournamentStandingsPayoutMode,
  type TournamentStandingsPayoutMode,
} from "@/lib/tournament-standings-display";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import type { TournamentStandingRow } from "@/services/tournaments.types";
import { TournamentBotLabel } from "./TournamentBotLabel";

type TournamentStandingsSectionProps = {
  title?: string;
  rows: TournamentStandingRow[];
  busy: boolean;
  error: string | null;
  tournamentStatus?: string;
  payoutMode?: TournamentStandingsPayoutMode;
};

export function TournamentStandingsSection({
  title = "Standings",
  rows,
  busy,
  error,
  tournamentStatus = "REGISTERING",
  payoutMode,
}: TournamentStandingsSectionProps) {
  const mode = payoutMode ?? resolveTournamentStandingsPayoutMode(tournamentStatus);
  const hasHumanPayout = rows.some((row) => !row.isBot && row.payoutCents > 0);
  const payoutHeader =
    mode === "prizes" ? "Payout" : mode === "refunds" ? "Refund" : null;

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <Text variant="h2">{title}</Text>
        {mode === "prizes" ? (
          <Text variant="muted">
            {rows.length > 0 && !hasHumanPayout
              ? "No money payout was issued for this result."
              : "Payouts are credited to humans only. Bots are not paid."}
          </Text>
        ) : null}
        {mode === "refunds" ? (
          <Text variant="muted">Entry fees were refunded. No prize payouts were issued.</Text>
        ) : null}
        {busy ? <ActivityIndicator /> : null}
        {error ? <Text variant="danger">{mapTournamentApiError(error)}</Text> : null}
        {!busy && !error && rows.length === 0 ? (
          <Text variant="muted">No players listed yet.</Text>
        ) : null}
        {!busy && !error
          ? rows.map((row) => {
              const statusLabel = formatTournamentStandingStatus(row);
              const payoutLabel = formatTournamentStandingPayout(row, mode);
              return (
                <View
                  key={row.userId}
                  className="ui-row items-center justify-between border-b border-border py-2"
                >
                  <View className="flex-1 min-w-0 pr-2">
                    <View className="ui-row items-center gap-2">
                      <Text variant="body" numberOfLines={1} className="flex-1 min-w-0">
                        {row.finishPlace != null ? `#${row.finishPlace} ` : "• "}
                        {row.displayName}
                      </Text>
                      {row.isBot ? <TournamentBotLabel /> : null}
                    </View>
                    {statusLabel ? (
                      <Text variant="label" className="text-muted">
                        {statusLabel}
                      </Text>
                    ) : null}
                  </View>
                  {payoutHeader && payoutLabel != null ? (
                    <Text variant="body" className="text-brand shrink-0">
                      {payoutLabel}
                    </Text>
                  ) : null}
                </View>
              );
            })
          : null}
      </View>
    </Surface>
  );
}
