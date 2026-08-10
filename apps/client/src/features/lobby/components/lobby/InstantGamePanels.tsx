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
  /** When true, add horizontal page padding (mobile). */
  padded?: boolean;
};

/** Instant bot starts as equal HUD strip buttons — not marketing cards. */
export function InstantGamePanels({
  inFlightPreset,
  onStart,
  padded = false,
}: InstantGamePanelsProps) {
  return (
    <View
      className={`ui-row items-center flex-wrap gap-2 pb-3 ${padded ? "px-4" : ""}`}
    >
      <Text variant="muted" className="text-[11px] tracking-widest uppercase mr-1">
        Play now
      </Text>
      {INSTANT_GAME_PRESET_IDS.map((presetId) => {
        const preset = getInstantGamePreset(presetId);
        const isStarting = inFlightPreset === presetId;
        return (
          <Button
            key={presetId}
            title={isStarting ? "Starting…" : preset.cta}
            onPress={() => onStart(presetId)}
            disabled={Boolean(inFlightPreset)}
            intent="secondary"
            size="sm"
            shape="hud"
            minWidth={128}
            className="w-[128px] border border-border"
          />
        );
      })}
    </View>
  );
}
