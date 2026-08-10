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
  /** Compact start-a-game strip for desktop lobby. */
  variant?: "cards" | "compact";
};

export function InstantGamePanels({
  inFlightPreset,
  onStart,
  variant = "cards",
}: InstantGamePanelsProps) {
  if (variant === "compact") {
    return (
      <View className="ui-stack-2 pb-3">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase">
          Start a game
        </Text>
        <View className="ui-row items-stretch flex-wrap gap-2">
          {INSTANT_GAME_PRESET_IDS.map((presetId) => {
            const preset = getInstantGamePreset(presetId);
            const isStarting = inFlightPreset === presetId;
            return (
              <View
                key={presetId}
                className="min-w-[200px] flex-1 max-w-[320px] rounded-lg border border-border bg-panel px-3 py-2.5"
              >
                <Text variant="body" className="text-[14px] font-semibold">
                  {preset.title}
                </Text>
                <Text variant="muted" className="mt-0.5 text-[12px]">
                  {preset.body}
                </Text>
                <View className="mt-2">
                  <Button
                    title={isStarting ? "Starting…" : preset.cta}
                    onPress={() => onStart(presetId)}
                    disabled={Boolean(inFlightPreset)}
                    intent="secondary"
                    size="sm"
                    minWidth={0}
                    className="min-h-[34px] px-3"
                  />
                </View>
              </View>
            );
          })}
        </View>
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
