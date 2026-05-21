import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
import { Loader } from "@/components/base/Loader";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import {
  ADMIN_BLIND_STRUCTURE_ID,
  DEFAULT_ADMIN_STARTING_STACK_CENTS,
  buildTournamentStartIso,
  defaultAdminTournamentStartParts,
  parseDollarsToCents,
  parsePositiveInt,
} from "@/lib/admin-tournament-form";
import { formatCents } from "@/lib/format";
import { formatTournamentStartLocal, formatTournamentStatus, mapTournamentErrorMessage } from "@/lib/tournament.utils";
import { serviceRegistry } from "@/registry/service.registry";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useToastStore } from "@/stores/toast.store";

function AdminTournamentRow({
  tournament,
  cancelBusy,
  onCancel,
}: {
  tournament: TournamentSummary;
  cancelBusy: boolean;
  onCancel: (id: string) => void;
}) {
  const canCancel = tournament.status === "REGISTERING";

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <View className="ui-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text variant="h2" numberOfLines={2}>
              {tournament.name}
            </Text>
            <Text variant="muted">{formatTournamentStartLocal(tournament.startTime)}</Text>
          </View>
          <Text variant="label" className="text-brand">
            {formatTournamentStatus(tournament.status)}
          </Text>
        </View>
        <View className="ui-row flex-wrap gap-3">
          <Text variant="body">Entry {formatCents(tournament.entryFeeCents)}</Text>
          <Text variant="body">
            {tournament.registeredCount}/{tournament.maxPlayers}
          </Text>
          <Text variant="body">Stack {tournament.startingStackCents.toLocaleString()}</Text>
        </View>
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
        {canCancel ? (
          <Button
            title="Cancel tournament"
            intent="danger"
            size="sm"
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
  const defaultStart = useMemo(() => defaultAdminTournamentStartParts(), []);

  const [list, setList] = useState<TournamentSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [cancelKey, setCancelKey] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [name, setName] = useState("");
  const [entryFeeDollars, setEntryFeeDollars] = useState("10");
  const [startDate, setStartDate] = useState(defaultStart.date);
  const [startTime, setStartTime] = useState(defaultStart.time);
  const [maxPlayers, setMaxPlayers] = useState("9");
  const [startingStack, setStartingStack] = useState(String(DEFAULT_ADMIN_STARTING_STACK_CENTS));

  const loadTournaments = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const res = await serviceRegistry.get.tournaments();
    if (!res.ok) {
      setListError(res.error.message || "Failed to load tournaments.");
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
        showToast(mapTournamentErrorMessage(res.error.message || "Cancel failed"), "danger");
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

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Tournament name is required", "danger");
      return;
    }
    const entryFeeCents = parseDollarsToCents(entryFeeDollars);
    if (entryFeeCents == null) {
      showToast("Enter a valid entry fee in dollars", "danger");
      return;
    }
    const startIso = buildTournamentStartIso(startDate, startTime);
    if (!startIso) {
      showToast("Enter a valid start date (YYYY-MM-DD) and time (HH:mm)", "danger");
      return;
    }
    const max = parsePositiveInt(maxPlayers, 2, 9);
    if (max == null) {
      showToast("Max players must be between 2 and 9", "danger");
      return;
    }
    const startingStackCents = parsePositiveInt(startingStack, 1, 1_000_000);
    if (startingStackCents == null) {
      showToast("Starting stack must be a positive number", "danger");
      return;
    }

    setCreateBusy(true);
    const res = await serviceRegistry.post.tournamentCreate({
      name: trimmedName,
      entryFeeCents,
      startTime: startIso,
      maxPlayers: max,
      startingStackCents,
      blindStructureId: ADMIN_BLIND_STRUCTURE_ID,
      lateRegMinutes: 0,
    });
    if (!res.ok) {
      showToast(mapTournamentErrorMessage(res.error.message || "Create failed"), "danger");
      setCreateBusy(false);
      return;
    }
    showToast("Tournament created", "success");
    setName("");
    await loadTournaments();
    setCreateBusy(false);
  }, [
    entryFeeDollars,
    loadTournaments,
    maxPlayers,
    name,
    showToast,
    startDate,
    startTime,
    startingStack,
  ]);

  return (
    <View className="flex-1 mt-4">
      <Surface styleId="surface.list.panel">
        <View className="ui-stack-3 p-4">
          <Text variant="h2">Create tournament</Text>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Friday Night MTT" />
          <Input
            label="Entry fee (USD)"
            value={entryFeeDollars}
            onChangeText={setEntryFeeDollars}
            keyboardType="decimal-pad"
            placeholder="10"
          />
          <View className="ui-row ui-inline-2">
            <View className="flex-1">
              <Input label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
            </View>
            <View className="flex-1">
              <Input label="Start time" value={startTime} onChangeText={setStartTime} placeholder="HH:mm" />
            </View>
          </View>
          <View className="ui-row ui-inline-2">
            <View className="flex-1">
              <Input
                label="Max players (2–9)"
                value={maxPlayers}
                onChangeText={setMaxPlayers}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Input
                label="Starting stack (chips)"
                value={startingStack}
                onChangeText={setStartingStack}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2">
            <Text variant="muted">Blind structure</Text>
            <Text variant="body">{ADMIN_BLIND_STRUCTURE_ID}</Text>
          </View>
          <Button title="Create tournament" loading={createBusy} onPress={() => { void handleCreate(); }} />
        </View>
      </Surface>

      <View className="mt-4 ui-row items-center justify-between">
        <Text variant="h2">Tournaments</Text>
        <Button title="Refresh" variant="ghost" size="sm" onPress={() => { void loadTournaments(); }} />
      </View>

      {listLoading ? <Loader /> : null}
      {listError ? <Text variant="danger">{listError}</Text> : null}
      {!listLoading && !listError && list.length === 0 ? (
        <Text variant="muted">No tournaments yet.</Text>
      ) : null}

      {!listLoading && !listError ? (
        <ScrollView className="mt-2 flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          {list.map((t) => (
            <AdminTournamentRow
              key={t.id}
              tournament={t}
              cancelBusy={cancelKey === t.id}
              onCancel={(id) => { void handleCancel(id); }}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
