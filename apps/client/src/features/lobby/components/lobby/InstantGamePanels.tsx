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
  padded?: boolean;
};

/** Weighted Play-now HUD strip — louder than filters, with stakes disclosure. */
export function InstantGamePanels({
  inFlightPreset,
  onStart,
  padded = false,
}: InstantGamePanelsProps) {
  return (
    <View className={`pb-4 ${padded ? "px-4" : ""}`}>
      <View className="ui-row items-end flex-wrap gap-3">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase pb-2 mr-1">
          Play now
        </Text>
        {INSTANT_GAME_PRESET_IDS.map((presetId) => {
          const preset = getInstantGamePreset(presetId);
          const isStarting = inFlightPreset === presetId;
          return (
            <View key={presetId} className="ui-stack-1">
              <Button
                title={isStarting ? "Starting…" : preset.cta}
                onPress={() => onStart(presetId)}
                disabled={Boolean(inFlightPreset)}
                intent="accent"
                size="md"
                shape="hud"
                minWidth={148}
                className="min-h-[40px]"
              />
              <Text variant="muted" className="text-[11px] tabular-nums">
                {preset.helper}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
