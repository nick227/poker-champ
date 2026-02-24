import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

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
  const title = joinDisabled && !voiceEnabled ? "\u{1F512}" : voiceEnabled ? "\u{1F508}" : "\u{1F507}";
  return (
    <View className="ui-row items-center ui-inline-2">
      {label != null && (
        <Text variant="label" className="mr-1">
          {participantCount != null ? `${label} (${participantCount})` : label}
        </Text>
      )}
      <Button
        variant="link"
        title={title}
        onPress={onToggleVoice}
        disabled={!voiceEnabled && !canJoin}
      />
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          alignSelf: "center",
          borderWidth: 1,
          borderColor: "#22c55e",
          backgroundColor: voiceEnabled ? "#22c55e" : "transparent",
        }}
      />
    </View>
  );
}
