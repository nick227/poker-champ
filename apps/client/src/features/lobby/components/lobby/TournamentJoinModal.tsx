import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import {
  formatBlindLevelRow,
  formatTournamentStackChips,
  getBlindLevelsForPreset,
} from "@/lib/tournament-detail";
import { formatTournamentStatus } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentJoinModalProps = {
  visible: boolean;
  tournament: TournamentSummary | null;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

function currentBlindsLabel(tournament: TournamentSummary): string {
  const levels = getBlindLevelsForPreset(tournament.blindStructureId);
  const row = levels.find((l) => l.level === tournament.currentLevel) ?? levels[0];
  if (!row) return "Blinds unavailable";
  return formatBlindLevelRow(row);
}

export function TournamentJoinModal({
  visible,
  tournament,
  onClose,
  onConfirm,
  busy,
}: TournamentJoinModalProps) {
  if (!tournament) return null;

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Enter tournament table">
      <View className="ui-stack-4">
        <View className="ui-stack-2">
          <Text variant="h2" numberOfLines={2}>
            {tournament.name}
          </Text>
          <Text variant="label" className="text-brand">
            {formatTournamentStatus(tournament.status)}
          </Text>
        </View>
        <View className="ui-stack-1">
          <Text variant="body">
            Players: {tournament.registeredCount} / {tournament.maxPlayers}
          </Text>
          <Text variant="body">Current blinds: {currentBlindsLabel(tournament)}</Text>
          <Text variant="body">Your stack: {formatTournamentStackChips(tournament.startingStackCents)}</Text>
          <Text variant="muted" className="text-sm">
            Entry fee was paid at registration. You will join your assigned seat — no additional buy-in.
          </Text>
        </View>
        <View className="ui-row ui-inline-2">
          <Button intent="ghost" title="Cancel" onPress={onClose} disabled={busy} />
          <Button
            intent="primary"
            title={busy ? "Joining…" : "Enter table"}
            onPress={onConfirm}
            disabled={busy}
          />
        </View>
      </View>
    </ModalSheet>
  );
}
