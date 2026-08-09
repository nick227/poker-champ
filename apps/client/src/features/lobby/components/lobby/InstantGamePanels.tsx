import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import {
  INSTANT_GAME_PRESET_IDS,
  getInstantGamePreset,
  type InstantGamePresetId,
} from "./instantGame.presets";

type InstantGamePanelsProps = {
  inFlightPreset: InstantGamePresetId | null;
  onStart: (presetId: InstantGamePresetId) => void;
  /** Compact single-row quick-play strip for desktop lobby. */
  variant?: "cards" | "compact";
};

export function InstantGamePanels({
  inFlightPreset,
  onStart,
  variant = "cards",
}: InstantGamePanelsProps) {
  if (variant === "compact") {
    return (
      <View className="ui-row items-center flex-wrap gap-2 pb-3">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase mr-1">
          Quick play
        </Text>
        {INSTANT_GAME_PRESET_IDS.map((presetId) => {
          const preset = getInstantGamePreset(presetId);
          const isStarting = inFlightPreset === presetId;
          return (
            <Button
              key={presetId}
              title={isStarting ? "Starting…" : preset.title}
              onPress={() => onStart(presetId)}
              disabled={Boolean(inFlightPreset)}
              intent="secondary"
              size="sm"
              minWidth={0}
              className="min-h-[36px] px-3"
            />
          );
        })}
      </View>
    );
  }

  return (
    <View className="px-4 pb-2">
      <View className="flex-row flex-wrap gap-3">
        {INSTANT_GAME_PRESET_IDS.map((presetId) => {
          const preset = getInstantGamePreset(presetId);
          const isStarting = inFlightPreset === presetId;
          return (
            <View
              key={presetId}
              className="flex-1 min-w-[140px] rounded-xl border border-border bg-panel p-3 lg:max-w-[280px]"
            >
              <Text variant="label" className="text-[10px]">
                Instant Game
              </Text>
              <Text variant="h2" className="mt-1 text-base">
                {preset.title}
              </Text>
              <Text variant="muted" className="mt-1 text-xs">
                {preset.body}
              </Text>
              <View className="mt-3">
                <Button
                  title={isStarting ? "Starting..." : preset.cta}
                  onPress={() => onStart(presetId)}
                  disabled={Boolean(inFlightPreset)}
                  minWidth={0}
                  className="w-full"
                />
              </View>
              {preset.helper ? (
                <Text variant="muted" className="mt-2 text-[11px]">
                  {preset.helper}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
