import { useEffect, useState } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { TournamentInTheMoneyReveal } from "./TournamentInTheMoneyReveal";
import {
  buildTournamentResultRevealKey,
  formatFinishPlace,
  getTournamentResultTier,
  shouldShowTournamentResultOverlay,
} from "./tournament-result.utils";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;
type TournamentViewer = NonNullable<TableSnapshotPayload["hero"]["tournamentViewer"]>;

type TournamentResultBannerProps = {
  tournament: TournamentOverlay;
  tournamentViewer?: TournamentViewer;
  onViewStandings: () => void;
  onBackToLobby: () => void;
};

export function TournamentResultBanner({
  tournament,
  tournamentViewer,
  onViewStandings,
  onBackToLobby,
}: TournamentResultBannerProps) {
  const eliminated = tournamentViewer?.isEliminated === true;
  const finished = tournament.status === "FINISHED";
  const showOverlay = shouldShowTournamentResultOverlay(eliminated, tournament.status);

  const place = tournamentViewer?.finishPlace;
  const payoutCents = tournamentViewer?.payoutCents ?? 0;
  const tier = getTournamentResultTier(place, payoutCents);
  const revealKey = buildTournamentResultRevealKey(
    tournament.tournamentId,
    place,
    payoutCents,
  );

  const [revealDismissed, setRevealDismissed] = useState(false);
  useEffect(() => {
    setRevealDismissed(false);
  }, [revealKey]);

  if (!showOverlay) return null;

  const showInTheMoneyReveal = tier !== "none" && !revealDismissed && place != null;

  if (showInTheMoneyReveal) {
    return (
      <TournamentInTheMoneyReveal
        visible
        tier={tier}
        finishPlace={place}
        payoutCents={payoutCents}
        onDismiss={() => setRevealDismissed(true)}
        onViewStandings={onViewStandings}
        onBackToLobby={onBackToLobby}
      />
    );
  }

  let headline = "You were eliminated from this tournament.";
  if (finished && !eliminated) {
    headline = "This tournament has finished.";
  } else if (place != null) {
    headline = `You finished in ${formatFinishPlace(place)} place.`;
  }

  const detail =
    payoutCents > 0
      ? `Payout: ${formatCents(payoutCents)}`
      : eliminated
        ? "Spectating — table actions are disabled."
        : null;

  const compactItm = tier !== "none";

  return (
    <View
      className={
        compactItm
          ? "border-b border-amber-500/40 bg-amber-950/40 px-4 py-3"
          : "border-b border-border bg-panel-elevated px-4 py-3"
      }
    >
      {compactItm ? (
        <Text variant="label" className="text-amber-300">
          {tier === "champion" ? "Tournament champion" : "In the money"}
        </Text>
      ) : null}
      <Text variant="body">{headline}</Text>
      {detail ? (
        <Text variant="muted" className="mt-1">
          {detail}
        </Text>
      ) : null}
      <View className="mt-2 flex-row gap-x-2">
        <Button title="View standings" intent="primary" size="sm" onPress={onViewStandings} />
        <Button title="Back to lobby" intent="ghost" size="sm" onPress={onBackToLobby} />
      </View>
    </View>
  );
}
