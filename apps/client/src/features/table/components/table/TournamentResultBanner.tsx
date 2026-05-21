import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;

type TournamentResultBannerProps = {
  tournament: TournamentOverlay;
  heroSeated: boolean;
  onViewStandings: () => void;
};

export function TournamentResultBanner({
  tournament,
  heroSeated,
  onViewStandings,
}: TournamentResultBannerProps) {
  const finished = tournament.status === "FINISHED";
  if (!finished && heroSeated) return null;

  const message = finished
    ? heroSeated
      ? "You won this tournament."
      : "You were eliminated from this tournament."
    : "You are no longer seated at this tournament table.";

  return (
    <View className="border-b border-border bg-panel-elevated px-4 py-3">
      <Text variant="body">{message}</Text>
      <View className="mt-2">
        <Button title="View standings" intent="primary" size="sm" onPress={onViewStandings} />
      </View>
    </View>
  );
}
