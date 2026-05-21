import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
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
import { BOT_DEMO_HELPER_COPY, BOT_DEMO_PRESET, formatTournamentBotFillSummary } from "@/lib/tournament-bot-fill";
import { formatCents } from "@/lib/format";
import { formatTournamentStartLocal, formatTournamentStatus, mapTournamentApiError } from "@/lib/tournament.utils";
import { TournamentListFeedback } from "@/features/lobby/components/lobby/TournamentListFeedback";
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
  const botFillSummary = formatTournamentBotFillSummary(tournament);

  return (
    <Surface styleId="surface.list.panel">
      <View className="ui-stack-3 p-4">
        <View className="ui-stack-2">
          <View className="ui-row flex-wrap items-start justify-between gap-2">
            <Text variant="h2" numberOfLines={2} className="min-w-0 flex-1">
              {tournament.name}
            </Text>
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
  const [fillBotsAtStart, setFillBotsAtStart] = useState(false);
  const [fillBotCount, setFillBotCount] = useState("");

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

  const applyBotDemoPreset = useCallback(() => {
    const parts = defaultAdminTournamentStartParts(new Date(), BOT_DEMO_PRESET.startsInMinutes);
    setName(BOT_DEMO_PRESET.name);
    setEntryFeeDollars(BOT_DEMO_PRESET.entryFeeDollars);
    setMaxPlayers(BOT_DEMO_PRESET.maxPlayers);
    setStartingStack(BOT_DEMO_PRESET.startingStack);
    setStartDate(parts.date);
    setStartTime(parts.time);
    setFillBotsAtStart(true);
    setFillBotCount(BOT_DEMO_PRESET.fillBotCount);
  }, []);

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
    const parsedFillBotCount = fillBotsAtStart
      ? parsePositiveInt(fillBotCount.trim() || String(max - 1), 1, max - 1)
      : null;
    if (fillBotsAtStart && parsedFillBotCount == null) {
      showToast("Bot count must be between 1 and max players minus one", "danger");
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
      fillBotsAtStart,
      ...(parsedFillBotCount != null ? { fillBotCount: parsedFillBotCount } : {}),
    });
    if (!res.ok) {
      showToast(mapTournamentApiError(res.error.message || "Create failed", res.error.code), "danger");
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
    fillBotCount,
    fillBotsAtStart,
    startingStack,
  ]);

  return (
    <View className="flex-1 mt-4">
      <Surface styleId="surface.list.panel">
        <View className="ui-stack-3 p-4">
          <Text variant="h2">Create tournament</Text>
          <Text variant="muted">Start date and time use your device local timezone.</Text>
          <View className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2 ui-stack-2">
            <Text variant="label">Bot-filled demo preset</Text>
            <Text variant="muted">{BOT_DEMO_HELPER_COPY}</Text>
            <Button
              title="Apply bot demo preset"
              variant="ghost"
              size="sm"
              className="w-full"
              onPress={applyBotDemoPreset}
            />
          </View>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Friday Night MTT" />
          <Input
            label="Entry fee (USD)"
            value={entryFeeDollars}
            onChangeText={setEntryFeeDollars}
            keyboardType="decimal-pad"
            placeholder="10"
          />
          <View className="ui-stack-3">
            <Input label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
            <Input label="Start time (local)" value={startTime} onChangeText={setStartTime} placeholder="HH:mm" />
          </View>
          <View className="ui-stack-3">
            <Input
              label="Max players (2–9)"
              value={maxPlayers}
              onChangeText={setMaxPlayers}
              keyboardType="number-pad"
            />
            <Input
              label="Starting stack (chips)"
              value={startingStack}
              onChangeText={setStartingStack}
              keyboardType="number-pad"
            />
          </View>
          <View className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2">
            <Text variant="muted">Blind structure</Text>
            <Text variant="body">{ADMIN_BLIND_STRUCTURE_ID}</Text>
          </View>
          <Button
            title={fillBotsAtStart ? "Fill open seats with bots at start: On" : "Fill open seats with bots at start: Off"}
            variant="ghost"
            size="sm"
            className="w-full"
            onPress={() => setFillBotsAtStart((value) => !value)}
          />
          {fillBotsAtStart ? (
            <>
              <Text variant="muted">
                At start, open seats fill with catalog bots (no entry fee). Payouts use human entrants only.
              </Text>
              <Input
                label="Bot count (optional)"
                value={fillBotCount}
                onChangeText={setFillBotCount}
                keyboardType="number-pad"
                placeholder="Defaults to fill open seats"
              />
            </>
          ) : null}
          <Button title="Create tournament" loading={createBusy} className="w-full" onPress={() => { void handleCreate(); }} />
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
              onCancel={(id) => { void handleCancel(id); }}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
