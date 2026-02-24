import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { PRESS_OPACITY } from "@/theme/animation";

export type VoiceBarControlsProps = {
  voiceEnabled: boolean;
  voiceMuted: boolean;
  onToggleVoice: () => void;
  onToggleMute: () => void;
  participantCount?: number;
  label?: string;
  /** When true, show "Lobby voice full" and do not allow join. */
  joinDisabled?: boolean;
};

export function VoiceBarControls({
  voiceEnabled,
  voiceMuted,
  onToggleVoice,
  onToggleMute,
  participantCount,
  label,
  joinDisabled = false,
}: VoiceBarControlsProps) {
  const canJoin = !joinDisabled;
  const isRecording = voiceEnabled && !voiceMuted;

  const handleToggle = () => {
    if (!voiceEnabled) {
      if (!canJoin) return;
      emitSoundEvent("voice.toggle");
      onToggleVoice();
      return;
    }
    emitSoundEvent("voice.toggle");
    onToggleMute();
  };

  return (
    <View className="ui-row items-center ui-inline-2 w-4">
      {label != null && (
        <Text variant="label" className="mr-1">
          {participantCount != null ? `${label} (${participantCount})` : label}
        </Text>
      )}
      <Pressable
        onPress={handleToggle}
        disabled={!voiceEnabled && !canJoin}
        style={({ pressed }) => ({
          opacity: !voiceEnabled && !canJoin ? PRESS_OPACITY.disabled : pressed ? PRESS_OPACITY.pressed : 1,
        })}
      >
        {isRecording ? (
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: "#22c55e",
            }}
          />
        ) : (
          <Text variant="body" allowFontScaling={false} style={{ fontSize: 18 }}>
            {"\u{1F3A4}"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
