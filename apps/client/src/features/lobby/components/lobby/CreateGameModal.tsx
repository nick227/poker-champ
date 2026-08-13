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
    <ModalSheet visible={visible} onClose={onClose} title={MODAL.createGame} heightFraction={0.99}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      <View className="">
        {onInstantStart ? (
          <View className="rounded-2 border border-brand/25 bg-brand-soft/30 px-3 py-3 mb-5">
            <Text variant="label" className="text-brand">
              Instant play
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {INSTANT_GAME_PRESET_IDS.map((presetId) => {
                const preset = getInstantGamePreset(presetId);
                const starting = instantStartInFlight === presetId;
                return (
                  <Button
                    key={presetId}
                    title={starting ? "…" : preset.cta}
                    intent="ghost"
                    size="sm"
                    shape="hud"
                    minWidth={0}
                    disabled={Boolean(instantStartInFlight)}
                    onPress={() => {
                      onInstantStart(presetId);
                      onClose();
                    }}
                    className="h-9 min-h-[36px] border border-brand bg-transparent"
                    textClassName="text-brand"
                  />
                );
              })}
            </View>
          </View>
        ) : null}
        <Input className="mb-5" label="Table Name" value={name} onChangeText={setName} placeholder="Enter table name..." />

        <View>
          <Text variant="label">Blinds</Text>
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
          <Text variant="label">Min buy-in</Text>
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
          <Text variant="label">Visibility</Text>
          <View className="ui-row ui-inline-2 mt-2 mb-5">
            <ChipButton title="Public" selected={visibility === "PUBLIC"} onPress={() => setVisibility("PUBLIC")} />
            <ChipButton title="Private" selected={visibility === "PRIVATE"} onPress={() => setVisibility("PRIVATE")} />
          </View>
        </View>

        {visibility === "PRIVATE" && (
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Invite-only password..."
            autoCapitalize="none"
          />
        )}

      <View>
        <Text variant="label">Num Players</Text>
        <View className="ui-row ui-inline-2 mb-5 mt-2">
          <ChipButton title="3 Players" selected={seats === 3} onPress={() => setSeats(3)} />
          <ChipButton title="6 Players" selected={seats === 6} onPress={() => setSeats(6)} />
          <ChipButton title="9 Players" selected={seats === 9} onPress={() => setSeats(9)} />
        </View>
      </View>

        <View>
          <Text variant="label">Show Stats</Text>
          <View className="ui-row ui-inline-2 mb-5 mt-2">
            <ChipButton title="On" selected={showStats === true} onPress={() => setShowStats(true)} />
            <ChipButton title="Off" selected={showStats === false} onPress={() => setShowStats(false)} />
          </View>
        </View>

        <View className="ui-row ui-inline-2 justify-end w-full">
          <Button intent="ghost" title="Cancel" onPress={onClose} />
          <Button intent="primary" title="Apply" onPress={handleSubmit} />
        </View>
      </View>
      </ScrollView>
    </ModalSheet>
  );
}
