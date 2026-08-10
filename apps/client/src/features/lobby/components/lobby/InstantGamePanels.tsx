import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
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

/** Full-width dual quick-match lanes — equal columns, HUD tiles (not left-clustered CTAs). */
export function InstantGamePanels({
  inFlightPreset,
  onStart,
  padded = false,
}: InstantGamePanelsProps) {
  const busy = Boolean(inFlightPreset);

  return (
    <View className={`pb-4 ${padded ? "px-4" : ""}`}>
      <View className="ui-row items-center justify-between pb-2">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase">
          Play now
        </Text>
        <Text variant="muted" className="text-[11px] tabular-nums">
          $1/$2 · instant seat
        </Text>
      </View>
      <View className="ui-row items-stretch gap-2 w-full">
        {INSTANT_GAME_PRESET_IDS.map((presetId) => {
          const preset = getInstantGamePreset(presetId);
          const isStarting = inFlightPreset === presetId;
          const disabled = busy;
          return (
            <Pressable
              key={presetId}
              disabled={disabled}
              onPress={() => {
                if (disabled) return;
                emitSoundEvent("ui.tap");
                onStart(presetId);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${preset.cta}. ${preset.helper}`}
              accessibilityState={{ disabled, busy: isStarting }}
              className={`btn lobby-hud flex-1 min-h-[52px] px-4 py-3 border border-border bg-panel-elevated border-l-2 border-l-accent-purple ${
                disabled && !isStarting ? "opacity-50" : ""
              }`}
              style={({ pressed }) => ({
                borderRadius: 8,
                flex: 1,
                opacity: disabled && !isStarting ? 0.5 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
              })}
            >
              <View className="ui-row items-center justify-between gap-3">
                <View className="flex-1 min-w-0">
                  <Text className="text-text text-[15px] font-semibold" numberOfLines={1}>
                    {isStarting ? "Starting…" : preset.cta}
                  </Text>
                  <Text variant="muted" className="text-[11px] tabular-nums mt-0.5" numberOfLines={1}>
                    {preset.helper}
                  </Text>
                </View>
                <View className="shrink-0 h-8 px-3 items-center justify-center rounded-2 bg-btn-accent">
                  <Text className="text-btn-accent-text text-[12px] font-semibold tracking-wide">
                    {isStarting ? "…" : "Play"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
