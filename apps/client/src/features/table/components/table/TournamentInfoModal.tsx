import { useEffect, useState } from "react";
import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { serviceRegistry } from "@/registry/service.registry";
import { buildBlindSummaryLines } from "@/lib/tournament-detail";
import {
  formatBuyInWindowLabel,
  formatRebuyWindowLabel,
  formatTournamentStatus,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  tournamentId: string;
};

function InfoLine({ label, value }: { label: string; value: string }) {
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

export function TournamentInfoModal({ visible, onClose, tournamentId }: TournamentInfoModalProps) {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await serviceRegistry.get.tournament(tournamentId);
      if (cancelled) return;
      if (res.ok) {
        setTournament(res.data);
      } else {
        setError(res.error.message || "Could not load tournament info");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tournamentId]);

  const rebuyLine = tournament ? formatRebuyWindowLabel(tournament) : null;
  const blindLines = tournament ? buildBlindSummaryLines(tournament.blindStructureId, tournament.currentLevel) : [];

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Tournament info">
      <View className="ui-stack-3">
        {loading && !tournament ? <Text variant="muted">Loading…</Text> : null}
        {error ? <Text variant="body" className="text-danger">{error}</Text> : null}
        {tournament ? (
          <>
            <Text variant="h2" numberOfLines={2}>
              {tournament.name}
            </Text>
            <Text variant="label" className="text-brand">
              {formatTournamentStatus(tournament.status)}
            </Text>
            <InfoLine
              label="Format"
              value={tournament.playFormat === "REBUY" ? "Rebuys allowed" : "Freeze-out"}
            />
            <InfoLine label="Buy-in window" value={formatBuyInWindowLabel(tournament)} />
            {rebuyLine ? <InfoLine label="Rebuy window" value={rebuyLine} /> : null}
            <View className="ui-stack-1 pt-2">
              <Text variant="label">Blind structure</Text>
              {blindLines.map((line) => (
                <Text key={line} variant="body" className="text-muted">
                  {line}
                </Text>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </ModalSheet>
  );
}
