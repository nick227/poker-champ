import { View } from "react-native";
import { Button } from "@/components/base/Button";
import {
  INSTANT_GAME_PRESET_IDS,
  getInstantGamePreset,
  type InstantGamePresetId,
} from "./instantGame.presets";

type Props = {
  inFlightPreset: InstantGamePresetId | null;
  onStart: (presetId: InstantGamePresetId) => void;
  onNew: () => void;
  padded?: boolean;
};

/** Compact instant starts + fixed New — one shared actions line. */
export function LobbyActionRow({
  inFlightPreset,
  onStart,
  onNew,
  padded = false,
}: Props) {
  const busy = Boolean(inFlightPreset);

  return (
    <View className={`ui-row items-center gap-2 w-full pb-4 ${padded ? "px-4" : ""}`}>
      {INSTANT_GAME_PRESET_IDS.map((presetId) => {
        const preset = getInstantGamePreset(presetId);
        const isStarting = inFlightPreset === presetId;
        return (
          <Button
            key={presetId}
            title={isStarting ? "…" : preset.cta}
            onPress={() => onStart(presetId)}
            disabled={busy}
            intent="accent"
            size="sm"
            shape="hud"
            minWidth={0}
            className="min-h-[32px] h-8 px-3"
          />
        );
      })}
      <View className="flex-1" />
      <Button
        title="New"
        onPress={() => {
          onNew();
        }}
        intent="secondary"
        size="sm"
        shape="hud"
        minWidth={0}
        className="shrink-0 min-h-[32px] h-8 px-4 border border-border"
      />
    </View>
  );
}
