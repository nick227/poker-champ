import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import {
  formatTournamentStandingPayout,
  formatTournamentStandingStatus,
  resolveTournamentStandingsPayoutMode,
} from "@/lib/tournament-standings-display";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { getTournamentStandings } from "@/services/get/tournaments.get";
import type { TournamentStandingRow } from "@/services/tournaments.types";

type TournamentStandingsModalProps = {
  visible: boolean;
  tournamentId: string | null;
  tournamentName?: string;
  tournamentStatus?: string;
  onClose: () => void;
};

export function TournamentStandingsModal({
  visible,
  tournamentId,
  tournamentName,
  tournamentStatus = "FINISHED",
  onClose,
}: TournamentStandingsModalProps) {
  const [rows, setRows] = useState<TournamentStandingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payoutMode = resolveTournamentStandingsPayoutMode(tournamentStatus);

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

  const subtitle =
    tournamentStatus === "ABANDONED"
      ? "Entry refunded · no payouts"
      : tournamentStatus === "CANCELLED"
        ? "Cancelled · refunds · no payouts"
        : "Human payouts only";

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={tournamentName ? `${tournamentName} — Results` : "Tournament results"}
    >
      <View className="ui-stack-3">
        <Text variant="muted">{subtitle}</Text>
        {busy ? (
          <ActivityIndicator />
        ) : error ? (
          <Text variant="danger">{mapTournamentApiError(error)}</Text>
        ) : rows.length === 0 ? (
          <Text variant="body" className="text-muted">
            No results yet.
          </Text>
        ) : (
          rows.map((row) => {
            const statusLabel = formatTournamentStandingStatus(row);
            const payoutLabel = formatTournamentStandingPayout(row, payoutMode);
            return (
              <View
                key={row.userId}
                className="ui-row items-center justify-between border-b border-border py-2"
              >
                <View className="flex-1 min-w-0 pr-2">
                  <Text variant="body">
                    #{row.finishPlace ?? "—"} {row.displayName}
                  </Text>
                  {statusLabel ? (
                    <Text variant="label" className="text-muted">
                      {statusLabel}
                    </Text>
                  ) : null}
                </View>
                {payoutLabel != null ? (
                  <Text variant="body" className="text-brand shrink-0">
                    {payoutLabel}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ModalSheet>
  );
}
