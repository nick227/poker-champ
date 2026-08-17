import { useState, useEffect } from "react";
import { ScrollView, View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Button } from "@/components/base/Button";
import { Input } from "@/components/base/Input";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import { MODAL } from "@/constants/copy";
import { getRandomTableName } from "@/services/tableNames";
import {
  BLINDS_OPTIONS,
  DEFAULT_SHOW_STATS,
  getBuyInOptions,
  getDefaultMinBuyInCents,
  getMaxBuyInCents,
} from "./createGame.constants";
import {
  INSTANT_GAME_PRESET_IDS,
  getInstantGamePreset,
  type InstantGamePresetId,
} from "./instantGame.presets";

const DEFAULT_BLINDS_INDEX = 0; // $1 / $2

export type CreateGameConfig = {
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  password?: string;
  showStats: boolean;
};

type CreateGameModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (config: CreateGameConfig) => void;
  onInstantStart?: (presetId: InstantGamePresetId) => void;
  instantStartInFlight?: InstantGamePresetId | null;
};

export function CreateGameModal({
  visible,
  onClose,
  onSubmit,
  onInstantStart,
  instantStartInFlight = null,
}: CreateGameModalProps) {
  const [name, setName] = useState(getRandomTableName());
  const [blindsIndex, setBlindsIndex] = useState(DEFAULT_BLINDS_INDEX);
  const [seats, setSeats] = useState<3 | 6 | 9 | 18>(6);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [password, setPassword] = useState("");
  const [showStats, setShowStats] = useState(DEFAULT_SHOW_STATS);

  const blinds = BLINDS_OPTIONS[blindsIndex] ?? BLINDS_OPTIONS[DEFAULT_BLINDS_INDEX];
  const { bigBlindCents, smallBlindCents } = blinds;

  const buyInOptions = getBuyInOptions(bigBlindCents);
  const [minBuyInCents, setMinBuyInCents] = useState(() =>
    getDefaultMinBuyInCents(BLINDS_OPTIONS[DEFAULT_BLINDS_INDEX].bigBlindCents)
  );
  const defaultMinCents = getDefaultMinBuyInCents(bigBlindCents);

  useEffect(() => {
    if (!visible) return;
    const bb = BLINDS_OPTIONS[DEFAULT_BLINDS_INDEX].bigBlindCents;
    setName(getRandomTableName());
    setBlindsIndex(DEFAULT_BLINDS_INDEX);
    setSeats(6);
    setVisibility("PUBLIC");
    setPassword("");
    setShowStats(DEFAULT_SHOW_STATS);
    setMinBuyInCents(getDefaultMinBuyInCents(bb));
  }, [visible]);

  const effectiveMinBuyInCents =
    buyInOptions.find((o) => o.minBuyInCents === minBuyInCents)?.minBuyInCents ?? defaultMinCents;

  const handleSubmit = () => {
    const cleanName = name.trim().slice(0, 40) || getRandomTableName();
    onSubmit({
      name: cleanName,
      maxSeats: seats,
      smallBlindCents,
      bigBlindCents,
      minBuyInCents: effectiveMinBuyInCents,
      maxBuyInCents: getMaxBuyInCents(bigBlindCents),
      visibility,
      password: visibility === "PRIVATE" && password ? password : undefined,
      showStats,
    });
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={MODAL.createGame}
      heightFraction={0.88}
      desktopCentered
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
      <View>
        {onInstantStart ? (
          <View className="mb-5">
            <Text variant="label" className="font-semibold tracking-[0.1em]">
              Instant play
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {INSTANT_GAME_PRESET_IDS.map((presetId) => {
                const preset = getInstantGamePreset(presetId);
                const starting = instantStartInFlight === presetId;
                return (
                  <ChipButton
                    key={presetId}
                    title={starting ? "…" : preset.cta}
                    selected={starting}
                    disabled={Boolean(instantStartInFlight)}
                    onPress={() => {
                      onInstantStart(presetId);
                      onClose();
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
        <View className="mb-5">
          <Text variant="label" className="font-semibold tracking-[0.1em]">Table name</Text>
          <View className="mt-2 rounded-2 border border-border bg-panel px-1">
            <Input bare value={name} onChangeText={setName} placeholder="Enter table name…" />
          </View>
        </View>

        <View>
          <Text variant="label" className="font-semibold tracking-[0.1em]">Blinds</Text>
          <View className="flex-row flex-wrap gap-2 mt-2 mb-5">
            {BLINDS_OPTIONS.map((opt, i) => (
              <ChipButton
                key={opt.label}
                title={opt.label}
                selected={blindsIndex === i}
                onPress={() => setBlindsIndex(i)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text variant="label" className="font-semibold tracking-[0.1em]">Min buy-in</Text>
          <View className="flex-row flex-wrap gap-2 mt-2 mb-5">
            {buyInOptions.map((opt) => (
              <ChipButton
                key={opt.minBuyInCents}
                title={opt.label}
                selected={effectiveMinBuyInCents === opt.minBuyInCents}
                onPress={() => setMinBuyInCents(opt.minBuyInCents)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text variant="label" className="font-semibold tracking-[0.1em]">Visibility</Text>
          <View className="ui-row ui-inline-2 mt-2 mb-5">
            <ChipButton title="Public" selected={visibility === "PUBLIC"} onPress={() => setVisibility("PUBLIC")} />
            <ChipButton title="Private" selected={visibility === "PRIVATE"} onPress={() => setVisibility("PRIVATE")} />
          </View>
        </View>

        {visibility === "PRIVATE" && (
          <View className="mb-5">
            <Text variant="label" className="font-semibold tracking-[0.1em]">Password</Text>
            <View className="mt-2 rounded-2 border border-border bg-panel px-1">
              <Input
                bare
                value={password}
                onChangeText={setPassword}
                placeholder="Invite-only password…"
                autoCapitalize="none"
              />
            </View>
          </View>
        )}

      <View>
        <Text variant="label" className="font-semibold tracking-[0.1em]">Players</Text>
        <View className="ui-row ui-inline-2 mb-5 mt-2">
          <ChipButton title="3 Players" selected={seats === 3} onPress={() => setSeats(3)} />
          <ChipButton title="6 Players" selected={seats === 6} onPress={() => setSeats(6)} />
          <ChipButton title="9 Players" selected={seats === 9} onPress={() => setSeats(9)} />
        </View>
      </View>

        <View>
          <Text variant="label" className="font-semibold tracking-[0.1em]">Show stats</Text>
          <View className="ui-row ui-inline-2 mb-5 mt-2">
            <ChipButton title="On" selected={showStats === true} onPress={() => setShowStats(true)} />
            <ChipButton title="Off" selected={showStats === false} onPress={() => setShowStats(false)} />
          </View>
        </View>

        <View className="ui-row ui-inline-2 justify-end w-full border-t border-border pt-4">
          <Button intent="ghost" shape="hud" title="Cancel" onPress={onClose} />
          <Button intent="accent" shape="hud" className="bg-brand" title="Apply" onPress={handleSubmit} />
        </View>
      </View>
      </ScrollView>
    </ModalSheet>
  );
}
