import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { getTournamentStandings } from "@/services/get/tournaments.get";
import type { TournamentStandingRow } from "@/services/tournaments.types";

type TournamentStandingsModalProps = {
  visible: boolean;
  tournamentId: string | null;
  tournamentName?: string;
  onClose: () => void;
};

export function TournamentStandingsModal({
  visible,
  tournamentId,
  tournamentName,
  onClose,
}: TournamentStandingsModalProps) {
  const [rows, setRows] = useState<TournamentStandingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !tournamentId) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void getTournamentStandings(tournamentId)
      .then((standings) => {
        if (!cancelled) setRows(standings);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load standings");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tournamentId]);

  return (
    <ModalSheet visible={visible} onClose={onClose} title={tournamentName ? `${tournamentName} — Results` : "Tournament results"}>
      <View className="ui-stack-3">
        {busy ? (
          <ActivityIndicator />
        ) : error ? (
          <Text variant="danger">{error}</Text>
        ) : rows.length === 0 ? (
          <Text variant="body" className="text-muted">
            No results yet.
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.userId} className="ui-row items-center justify-between border-b border-border py-2">
              <View className="flex-1">
                <Text variant="body">
                  #{row.finishPlace ?? "—"} {row.displayName}
                </Text>
                {row.eliminatedAt ? (
                  <Text variant="label" className="text-muted">
                    Eliminated
                  </Text>
                ) : null}
              </View>
              <Text variant="body" className="text-brand">
                {row.payoutCents > 0 ? formatCents(row.payoutCents) : "—"}
              </Text>
            </View>
          ))
        )}
      </View>
    </ModalSheet>
  );
}
