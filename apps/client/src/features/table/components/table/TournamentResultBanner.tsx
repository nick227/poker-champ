import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;
type TournamentViewer = NonNullable<TableSnapshotPayload["hero"]["tournamentViewer"]>;

type TournamentResultBannerProps = {
  tournament: TournamentOverlay;
  tournamentViewer?: TournamentViewer;
  onViewStandings: () => void;
  onBackToLobby: () => void;
};

function formatFinishPlace(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

export function TournamentResultBanner({
  tournament,
  tournamentViewer,
  onViewStandings,
  onBackToLobby,
}: TournamentResultBannerProps) {
  const eliminated = tournamentViewer?.isEliminated === true;
  const finished = tournament.status === "FINISHED";
  if (!eliminated && !finished) return null;

  const place = tournamentViewer?.finishPlace;
  const payoutCents = tournamentViewer?.payoutCents ?? 0;

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

  return (
    <View className="border-b border-border bg-panel-elevated px-4 py-3">
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
