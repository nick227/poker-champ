import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { formatCents } from "@/lib/format";
import {
  buildBlindSummaryLines,
  buildPayoutSummaryLines,
  buildTournamentTimeline,
} from "@/lib/tournament-detail";
import { formatTournamentBotFillSummary } from "@/lib/tournament-bot-fill";
import {
  formatTournamentStartLocal,
  formatTournamentStatus,
  resolveTournamentCta,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentStandingsSection } from "./TournamentStandingsSection";
import type { TournamentStandingRow } from "@/services/tournaments.types";

type TournamentDetailBodyProps = {
  tournament: TournamentSummary;
  authenticated: boolean;
  actionInFlight: boolean;
  rosterRows: TournamentStandingRow[];
  rosterBusy: boolean;
  rosterError: string | null;
  onPrimaryAction: () => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="ui-row items-start justify-between gap-3 py-1">
      <Text variant="muted" className="shrink-0">
        {label}
      </Text>
      <Text variant="body" className="flex-1 text-right">
        {value}
      </Text>
    </View>
  );
}

export function TournamentDetailBody({
  tournament,
  authenticated,
  actionInFlight,
  rosterRows,
  rosterBusy,
  rosterError,
  onPrimaryAction,
}: TournamentDetailBodyProps) {
  const cta = resolveTournamentCta(tournament, { authenticated });
  const payoutLines = buildPayoutSummaryLines(
    tournament.prizePoolCents,
    Math.max(tournament.registeredCount, 2),
  );
  const blindLines = buildBlindSummaryLines(tournament.blindStructureId, tournament.currentLevel);
  const timeline = buildTournamentTimeline(tournament.status);
  const showFinishedStandings = tournament.status === "FINISHED";
  const showRoster =
    tournament.registeredCount > 0 && (tournament.status === "REGISTERING" || showFinishedStandings);
  const botFillSummary = formatTournamentBotFillSummary(tournament);

  return (
    <View className="ui-stack-4 px-4 pb-8">
      <Surface styleId="surface.list.panel">
        <View className="ui-stack-3 p-4">
          <View className="ui-stack-2">
            <Text variant="h1" numberOfLines={3}>
              {tournament.name}
            </Text>
            <Text variant="label" className="text-brand">
              {formatTournamentStatus(tournament.status)}
            </Text>
          </View>
          <InfoRow label="Starts" value={formatTournamentStartLocal(tournament.startTime)} />
          <InfoRow label="Entry fee" value={formatCents(tournament.entryFeeCents)} />
          <InfoRow
            label="Registered"
            value={`${tournament.registeredCount} / ${tournament.maxPlayers}`}
          />
          <InfoRow label="Starting stack" value={tournament.startingStackCents.toLocaleString()} />
          <InfoRow label="Blind preset" value={tournament.blindStructureId} />
          <InfoRow label="Prize pool" value={formatCents(tournament.prizePoolCents)} />
          {botFillSummary ? <InfoRow label="Bot fill" value={botFillSummary} /> : null}
          {tournament.tableId ? <InfoRow label="Table" value={tournament.tableId} /> : null}
          {tournament.roomId ? <InfoRow label="Room" value={tournament.roomId} /> : null}
          <Button
            title={actionInFlight ? "Please wait…" : cta.label}
            intent={cta.action === "unregister" ? "neutral" : "primary"}
            size="md"
            className="w-full"
            disabled={cta.disabled || actionInFlight}
            onPress={onPrimaryAction}
          />
          {tournament.status === "CANCELLED" ? (
            <Text variant="muted">This tournament was cancelled. Entry fees were refunded.</Text>
          ) : null}
        </View>
      </Surface>

      <Surface styleId="surface.list.panel">
        <View className="ui-stack-2 p-4">
          <Text variant="h2">Status</Text>
          {timeline.map((step) => (
            <View key={step.key} className="ui-row items-center gap-2">
              <Text variant="label" className={step.state === "current" ? "text-brand" : "text-muted"}>
                {step.state === "done" ? "✓" : step.state === "cancelled" ? "×" : "○"}
              </Text>
              <Text variant="body" className={step.state === "current" ? "text-brand" : undefined}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface styleId="surface.list.panel">
        <View className="ui-stack-2 p-4">
          <Text variant="h2">Payouts</Text>
          <Text variant="muted">Based on current prize pool and registration count.</Text>
          {payoutLines.map((line) => (
            <Text key={line} variant="body">
              {line}
            </Text>
          ))}
        </View>
      </Surface>

      <Surface styleId="surface.list.panel">
        <View className="ui-stack-2 p-4">
          <Text variant="h2">Blind structure</Text>
          {blindLines.map((line) => (
            <Text key={line} variant="body" className="text-muted">
              {line}
            </Text>
          ))}
        </View>
      </Surface>

      {showRoster ? (
        <TournamentStandingsSection
          title={showFinishedStandings ? "Final standings" : "Registered players"}
          rows={rosterRows}
          busy={rosterBusy}
          error={rosterError}
          showPayouts={showFinishedStandings}
        />
      ) : null}
    </View>
  );
}
