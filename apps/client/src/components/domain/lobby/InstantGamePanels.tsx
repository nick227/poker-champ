import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { INSTANT_GAME_PRESET_IDS, getInstantGamePreset, type InstantGamePresetId } from "./instantGame.presets";

type InstantGamePanelsProps = {
  inFlightPreset: InstantGamePresetId | null;
  onStart: (presetId: InstantGamePresetId) => void;
};

export function InstantGamePanels({ inFlightPreset, onStart }: InstantGamePanelsProps) {
  return (
    <View className="px-4 pb-2">
      <View className="flex-row gap-3">
        {INSTANT_GAME_PRESET_IDS.map((presetId) => {
          const preset = getInstantGamePreset(presetId);
          const isStarting = inFlightPreset === presetId;
          return (
            <View key={presetId} className="flex-1 rounded-xl border border-border bg-panel p-3">
              <Text variant="label" className="text-[10px]">Instant Game</Text>
              <Text variant="h2" className="mt-1 text-base">{preset.title}</Text>
              <Text variant="muted" className="mt-1 text-xs">{preset.body}</Text>
              <Text variant="muted" className="mt-1 text-xs">{preset.subtitle}</Text>
              <View className="mt-3">
                <Button
                  title={isStarting ? "Starting..." : preset.cta}
                  onPress={() => onStart(presetId)}
                  disabled={Boolean(inFlightPreset)}
                  minWidth={0}
                  className="w-full"
                />
              </View>
              <Text variant="muted" className="mt-2 text-[11px]">{preset.helper}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
