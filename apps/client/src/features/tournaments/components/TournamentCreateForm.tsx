import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
import { Text } from "@/components/base/Text";
import {
  ADMIN_BLIND_STRUCTURE_ID,
  DEFAULT_ADMIN_STARTING_STACK_CENTS,
  buildTournamentStartIso,
  defaultAdminTournamentStartParts,
  parseDollarsToCents,
  parsePositiveInt,
} from "@/lib/admin-tournament-form";
import { BOT_DEMO_HELPER_COPY, BOT_DEMO_PRESET } from "@/lib/tournament-bot-fill";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";

type TournamentCreateFormProps = {
  showBotPreset?: boolean;
  onCreated?: () => void | Promise<void>;
};

export function TournamentCreateForm({ showBotPreset = true, onCreated }: TournamentCreateFormProps) {
  const showToast = useToastStore((s) => s.show);
  const defaultStart = useMemo(() => defaultAdminTournamentStartParts(), []);

  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState("");
  const [entryFeeDollars, setEntryFeeDollars] = useState("10");
  const [startDate, setStartDate] = useState(defaultStart.date);
  const [startTime, setStartTime] = useState(defaultStart.time);
  const [maxPlayers, setMaxPlayers] = useState("9");
  const [startingStack, setStartingStack] = useState(String(DEFAULT_ADMIN_STARTING_STACK_CENTS));
  const [fillBotsAtStart, setFillBotsAtStart] = useState(false);
  const [fillBotCount, setFillBotCount] = useState("");

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
    await onCreated?.();
    setCreateBusy(false);
  }, [
    entryFeeDollars,
    fillBotCount,
    fillBotsAtStart,
    maxPlayers,
    name,
    onCreated,
    showToast,
    startDate,
    startTime,
    startingStack,
  ]);

  return (
    <View className="ui-stack-3">
      <Text variant="muted">Start date and time use your device local timezone.</Text>
      {showBotPreset ? (
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
      ) : null}
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
  );
}
