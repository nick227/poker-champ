import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { TournamentCreateForm } from "@/features/tournaments/components/TournamentCreateForm";
import { formatTournamentBotFillSummary } from "@/lib/tournament-bot-fill";
import { formatCents } from "@/lib/format";
import { formatTournamentStartLocal, formatTournamentStatus, mapTournamentApiError } from "@/lib/tournament.utils";
import { TournamentListFeedback } from "@/features/lobby";
import { serviceRegistry } from "@/registry/service.registry";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useToastStore } from "@/stores/toast.store";

function AdminTournamentRow({
  tournament,
  cancelBusy,
  rebalanceBusy,
  onCancel,
  onRebalance,
}: {
  tournament: TournamentSummary;
  cancelBusy: boolean;
  rebalanceBusy: boolean;
  onCancel: (id: string) => void;
  onRebalance: (id: string) => void;
}) {
  const canCancel = tournament.status === "REGISTERING";
  // Manual balance override only makes sense for a live multi-table tournament (2+ open tables).
  const canRebalance = tournament.status === "RUNNING" && (tournament.openTableCount ?? 0) >= 2;
  const botFillSummary = formatTournamentBotFillSummary(tournament);

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <View className="ui-stack-2">
          <View className="ui-row flex-wrap items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text variant="h2" numberOfLines={2}>
                {tournament.name}
              </Text>
            </View>
            <Text variant="label" className="text-brand shrink-0">
              {formatTournamentStatus(tournament.status)}
            </Text>
          </View>
          <Text variant="muted">Starts {formatTournamentStartLocal(tournament.startTime)}</Text>
        </View>
        <View className="ui-row flex-wrap gap-3">
          <Text variant="body">Entry {formatCents(tournament.entryFeeCents)}</Text>
          <Text variant="body">
            {tournament.registeredCount}/{tournament.maxPlayers}
          </Text>
          <Text variant="body">Stack {tournament.startingStackCents.toLocaleString()}</Text>
        </View>
        {botFillSummary ? <Text variant="muted">{botFillSummary}</Text> : null}
        {tournament.tableCount != null && tournament.tableCount > 1 ? (
          <Text variant="muted">
            {tournament.openTableCount ?? tournament.tableCount}/{tournament.tableCount} tables open
          </Text>
        ) : null}
        {tournament.tableId || tournament.roomId ? (
          <View className="ui-stack-1">
            {tournament.tableId ? (
              <Text variant="muted" numberOfLines={1}>
                table: {tournament.tableId}
              </Text>
            ) : null}
            {tournament.roomId ? (
              <Text variant="muted" numberOfLines={1}>
                room: {tournament.roomId}
              </Text>
            ) : null}
          </View>
        ) : null}
        {canRebalance ? (
          <Button
            title="Rebalance now"
            variant="ghost"
            size="sm"
            className="w-full"
            loading={rebalanceBusy}
            onPress={() => onRebalance(tournament.id)}
          />
        ) : null}
        {canCancel ? (
          <Button
            title="Cancel tournament"
            intent="danger"
            size="sm"
            className="w-full"
            loading={cancelBusy}
            onPress={() => onCancel(tournament.id)}
          />
        ) : null}
      </View>
    </Surface>
  );
}

export function AdminTournamentsPanel() {
  const showToast = useToastStore((s) => s.show);

  const [list, setList] = useState<TournamentSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [cancelKey, setCancelKey] = useState<string | null>(null);
  const [rebalanceKey, setRebalanceKey] = useState<string | null>(null);

  const loadTournaments = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const res = await serviceRegistry.get.tournaments();
    if (!res.ok) {
      setListError(mapTournamentApiError(res.error.message || "Failed to load tournaments.", res.error.code));
      setList([]);
      setListLoading(false);
      return;
    }
    const rows = (res.data.tournaments ?? []) as TournamentSummary[];
    rows.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    setList(rows);
    setListLoading(false);
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  const handleCancel = useCallback(
    async (tournamentId: string) => {
      setCancelKey(tournamentId);
      const res = await serviceRegistry.post.tournamentCancel(tournamentId);
      if (!res.ok) {
        showToast(mapTournamentApiError(res.error.message || "Cancel failed", res.error.code), "danger");
        setCancelKey(null);
        return;
      }
      const refunded = res.data.refundedCount ?? 0;
      showToast(
        refunded > 0 ? `Tournament cancelled (${refunded} refunded)` : "Tournament cancelled",
        "success",
      );
      await loadTournaments();
      setCancelKey(null);
    },
    [loadTournaments, showToast],
  );

  const handleRebalance = useCallback(
    async (tournamentId: string) => {
      setRebalanceKey(tournamentId);
      const res = await serviceRegistry.post.tournamentRebalance(tournamentId);
      if (!res.ok) {
        showToast(mapTournamentApiError(res.error.message || "Rebalance failed", res.error.code), "danger");
        setRebalanceKey(null);
        return;
      }
      showToast(res.data.moved ? "Moved one player to balance tables" : "Tables already balanced", "success");
      await loadTournaments();
      setRebalanceKey(null);
    },
    [loadTournaments, showToast],
  );

  return (
    <View className="flex-1 mt-4">
      <Surface styleId="surface.list.panel">
        <View className="ui-stack-3 p-4">
          <Text variant="h2">Create tournament</Text>
          <TournamentCreateForm onCreated={loadTournaments} />
        </View>
      </Surface>

      <View className="mt-4 ui-row flex-wrap items-center justify-between gap-2">
        <Text variant="h2">Tournaments</Text>
        <Button title="Refresh" variant="ghost" size="sm" onPress={() => { void loadTournaments(); }} />
      </View>

      <TournamentListFeedback
        busy={listLoading}
        error={listError}
        isEmpty={list.length === 0}
        emptyMessage="No tournaments yet. Create one above or run pnpm tournaments:seed:soon."
        onRetry={() => { void loadTournaments(); }}
      />

      {!listLoading && !listError ? (
        <ScrollView className="mt-2 flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          {list.map((t) => (
            <AdminTournamentRow
              key={t.id}
              tournament={t}
              cancelBusy={cancelKey === t.id}
              rebalanceBusy={rebalanceKey === t.id}
              onCancel={(id) => { void handleCancel(id); }}
              onRebalance={(id) => { void handleRebalance(id); }}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
