import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { formatTournamentStartLocal } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentRegisterModalProps = {
  visible: boolean;
  tournament: TournamentSummary | null;
  balanceCents: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function TournamentRegisterModal({
  visible,
  tournament,
  balanceCents,
  busy,
  onClose,
  onConfirm,
}: TournamentRegisterModalProps) {
  if (!tournament) return null;

  const canAfford = balanceCents >= tournament.entryFeeCents;

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Register for tournament">
      <View className="ui-stack-4">
        <View>
          <Text variant="h2">{tournament.name}</Text>
          <Text variant="body" className="text-muted">
            Starts {formatTournamentStartLocal(tournament.startTime)}
          </Text>
        </View>
        <View>
          <Text variant="label">Entry fee</Text>
          <Text variant="h2" className="text-brand">
            {formatCents(tournament.entryFeeCents)}
          </Text>
        </View>
        <View>
          <Text variant="label">Your balance</Text>
          <Text variant="body">{formatCents(balanceCents)}</Text>
        </View>
        <Text variant="body" className="text-muted">
          Entry fee is deducted immediately. Unregister before start for a full refund.
        </Text>
        {!canAfford ? (
          <Text variant="body" className="text-danger">
            Insufficient bankroll for this entry fee.
          </Text>
        ) : null}
        <View className="ui-row ui-inline-2">
          <Button intent="ghost" title="Cancel" onPress={onClose} disabled={busy} />
          <Button
            intent="primary"
            title={busy ? "Registering…" : "Confirm"}
            onPress={onConfirm}
            disabled={!canAfford || busy}
          />
        </View>
      </View>
    </ModalSheet>
  );
}
