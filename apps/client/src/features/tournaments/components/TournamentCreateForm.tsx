import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { Input } from "@/components/base/Input";
import { Text } from "@/components/base/Text";
import {
  TOURNAMENT_ENTRY_FEE_OPTIONS,
  TOURNAMENT_MAX_PLAYERS_OPTIONS,
  TOURNAMENT_MAX_REBUYS_OPTIONS,
  TOURNAMENT_PACE_OPTIONS,
  TOURNAMENT_STARTING_STACK_OPTIONS,
  blindStructureIdForPace,
  defaultEntryFeeCents,
  defaultPacePreset,
  defaultStartingStackChips,
  type TournamentPacePreset,
  type TournamentPlayFormatChoice,
} from "@/features/tournaments/tournament-create.presets";
import { parseDollarsToCents, parsePositiveInt } from "@/lib/admin-tournament-form";
import {
  defaultLateRegMinutesForStructure,
  defaultRebuyPeriodMinutesForStructure,
} from "@/lib/tournament-schedule";
import {
  buildTournamentStartIsoFromSchedule,
  defaultTournamentStartSchedule,
  isTournamentStartInPast,
  type TournamentStartSchedule,
} from "@/lib/tournament-start-schedule";
import { TournamentStartScheduleFields } from "./TournamentStartScheduleFields";
import { BOT_DEMO_HELPER_COPY, BOT_DEMO_PRESET } from "@/lib/tournament-bot-fill";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { serviceRegistry } from "@/registry/service.registry";
import { getRandomTableName } from "@/services/tableNames";
import { useToastStore } from "@/stores/toast.store";

type TournamentCreateFormProps = {
  visible?: boolean;
  showBotPreset?: boolean;
  onCreated?: () => void | Promise<void>;
};

function ChipSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="ui-stack-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function resetFormState() {
  return {
    name: getRandomTableName(),
    entryFeeCents: defaultEntryFeeCents(),
    startingStackChips: defaultStartingStackChips(),
    pace: defaultPacePreset(),
    maxPlayers: 9,
    instantStart: false,
    playFormat: "FREEZEOUT" as TournamentPlayFormatChoice,
    maxRebuys: 2,
    startSchedule: defaultTournamentStartSchedule(),
    fillBotsAtStart: false,
    fillBotCount: "",
  };
}

export function TournamentCreateForm({ visible = true, showBotPreset = true, onCreated }: TournamentCreateFormProps) {
  const showToast = useToastStore((s) => s.show);
  const initial = useMemo(() => resetFormState(), []);

  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState(initial.name);
  const [entryFeeCents, setEntryFeeCents] = useState(initial.entryFeeCents);
  const [startingStackChips, setStartingStackChips] = useState(initial.startingStackChips);
  const [pace, setPace] = useState<TournamentPacePreset>(initial.pace);
  const [maxPlayers, setMaxPlayers] = useState(initial.maxPlayers);
  const [instantStart, setInstantStart] = useState(initial.instantStart);
  const [playFormat, setPlayFormat] = useState<TournamentPlayFormatChoice>(initial.playFormat);
  const [maxRebuys, setMaxRebuys] = useState(initial.maxRebuys);
  const [startSchedule, setStartSchedule] = useState<TournamentStartSchedule>(initial.startSchedule);
  const [fillBotsAtStart, setFillBotsAtStart] = useState(initial.fillBotsAtStart);
  const [fillBotCount, setFillBotCount] = useState(initial.fillBotCount);

  const blindStructureId = blindStructureIdForPace(pace);
  const paceMeta = TOURNAMENT_PACE_OPTIONS.find((opt) => opt.id === pace);

  useEffect(() => {
    if (!visible) return;
    const next = resetFormState();
    setName(next.name);
    setEntryFeeCents(next.entryFeeCents);
    setStartingStackChips(next.startingStackChips);
    setPace(next.pace);
    setMaxPlayers(next.maxPlayers);
    setInstantStart(next.instantStart);
    setPlayFormat(next.playFormat);
    setMaxRebuys(next.maxRebuys);
    setStartSchedule(next.startSchedule);
    setFillBotsAtStart(next.fillBotsAtStart);
    setFillBotCount(next.fillBotCount);
  }, [visible]);

  const applyBotDemoPreset = useCallback(() => {
    setStartSchedule(defaultTournamentStartSchedule(new Date(), BOT_DEMO_PRESET.startsInMinutes));
    setName(BOT_DEMO_PRESET.name);
    setEntryFeeCents(parseDollarsToCents(BOT_DEMO_PRESET.entryFeeDollars) ?? defaultEntryFeeCents());
    setMaxPlayers(Number(BOT_DEMO_PRESET.maxPlayers));
    setStartingStackChips(Number(BOT_DEMO_PRESET.startingStack));
    setFillBotsAtStart(true);
    setFillBotCount(BOT_DEMO_PRESET.fillBotCount);
    setInstantStart(false);
    setPlayFormat("FREEZEOUT");
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim().slice(0, 120) || getRandomTableName();
    const startIso = instantStart
      ? new Date().toISOString()
      : buildTournamentStartIsoFromSchedule(startSchedule);

    if (!instantStart) {
      if (!startIso) {
        showToast("Choose a valid start date and time", "danger");
        return;
      }
      if (isTournamentStartInPast(startIso)) {
        showToast("Start time cannot be in the past", "danger");
        return;
      }
    }

    const parsedFillBotCount = fillBotsAtStart
      ? parsePositiveInt(fillBotCount.trim() || String(maxPlayers - 1), 1, maxPlayers - 1)
      : null;
    if (fillBotsAtStart && parsedFillBotCount == null) {
      showToast("Bot count must be between 1 and max players minus one", "danger");
      return;
    }

    const rebuyPeriodMinutes =
      playFormat === "REBUY" ? defaultRebuyPeriodMinutesForStructure(blindStructureId) : 0;

    setCreateBusy(true);
    const res = await serviceRegistry.post.tournamentCreate({
      name: trimmedName,
      entryFeeCents,
      startTime: startIso ?? new Date().toISOString(),
      maxPlayers,
      startingStackCents: startingStackChips,
      blindStructureId,
      lateRegMinutes: defaultLateRegMinutesForStructure(blindStructureId),
      playFormat,
      maxRebuysPerPlayer: playFormat === "REBUY" ? maxRebuys : 0,
      rebuyPeriodMinutes,
      instantStart,
      fillBotsAtStart,
      ...(parsedFillBotCount != null ? { fillBotCount: parsedFillBotCount } : {}),
    });
    if (!res.ok) {
      showToast(mapTournamentApiError(res.error.message || "Create failed", res.error.code), "danger");
      setCreateBusy(false);
      return;
    }
    showToast(instantStart ? "Tournament started — registration open" : "Tournament created", "success");
    await onCreated?.();
    setCreateBusy(false);
  }, [
    blindStructureId,
    entryFeeCents,
    fillBotCount,
    fillBotsAtStart,
    instantStart,
    maxPlayers,
    maxRebuys,
    name,
    onCreated,
    playFormat,
    showToast,
    startSchedule,
    startingStackChips,
  ]);

  return (
    <View className="ui-stack-4">
      <Text variant="muted">
        Scheduled starts use your device local timezone. Instant start opens the table now with late registration.
      </Text>

      {showBotPreset ? (
        <View className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2 ui-stack-2">
          <Text variant="label">Bot-filled demo preset</Text>
          <Text variant="muted">{BOT_DEMO_HELPER_COPY}</Text>
          <Button title="Apply bot demo preset" variant="ghost" size="sm" className="w-full" onPress={applyBotDemoPreset} />
        </View>
      ) : null}

      <View className="ui-stack-2">
        <Input label="Tournament name" value={name} onChangeText={setName} placeholder="Enter tournament name..." />
        <Button title="Shuffle name" variant="ghost" size="sm" className="self-start" onPress={() => setName(getRandomTableName())} />
      </View>

      <ChipSection label="Entry fee">
        {TOURNAMENT_ENTRY_FEE_OPTIONS.map((opt) => (
          <ChipButton
            key={opt.cents}
            title={opt.label}
            selected={entryFeeCents === opt.cents}
            onPress={() => setEntryFeeCents(opt.cents)}
          />
        ))}
      </ChipSection>

      <ChipSection label="Starting stack">
        {TOURNAMENT_STARTING_STACK_OPTIONS.map((opt) => (
          <ChipButton
            key={opt.chips}
            title={opt.label}
            selected={startingStackChips === opt.chips}
            onPress={() => setStartingStackChips(opt.chips)}
          />
        ))}
      </ChipSection>

      <ChipSection label="Blind pace">
        {TOURNAMENT_PACE_OPTIONS.map((opt) => (
          <ChipButton
            key={opt.id}
            title={opt.label}
            selected={pace === opt.id}
            onPress={() => setPace(opt.id)}
          />
        ))}
      </ChipSection>
      {paceMeta ? <Text variant="muted">{paceMeta.description}</Text> : null}

      <ChipSection label="Max players">
        {TOURNAMENT_MAX_PLAYERS_OPTIONS.map((count) => (
          <ChipButton
            key={count}
            title={String(count)}
            selected={maxPlayers === count}
            onPress={() => setMaxPlayers(count)}
          />
        ))}
      </ChipSection>

      <ChipSection label="Format">
        <ChipButton title="Freeze-out" selected={playFormat === "FREEZEOUT"} onPress={() => setPlayFormat("FREEZEOUT")} />
        <ChipButton title="Rebuys" selected={playFormat === "REBUY"} onPress={() => setPlayFormat("REBUY")} />
      </ChipSection>

      {playFormat === "REBUY" ? (
        <ChipSection label="Max rebuys per player">
          {TOURNAMENT_MAX_REBUYS_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              title={opt.label}
              selected={maxRebuys === opt.value}
              onPress={() => setMaxRebuys(opt.value)}
            />
          ))}
        </ChipSection>
      ) : null}

      <ChipSection label="Start">
        <ChipButton title="Schedule" selected={!instantStart} onPress={() => setInstantStart(false)} />
        <ChipButton title="Instant start" selected={instantStart} onPress={() => setInstantStart(true)} />
      </ChipSection>

      {!instantStart ? (
        <TournamentStartScheduleFields value={startSchedule} onChange={setStartSchedule} />
      ) : (
        <Text variant="body" className="text-muted">
          Table opens immediately. Players can register during the late-registration window.
        </Text>
      )}

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
