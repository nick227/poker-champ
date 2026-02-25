import { View } from "react-native";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";

export type TableTopBarActionsProps = {
  chatBadge?: number;
  voiceEnabled: boolean;
  voiceMuted: boolean;
  onOpenTheme: () => void;
  onOpenChat: () => void;
  onToggleVoice: () => void;
  onToggleMute: () => void;
};

export function TableTopBarActions({
  chatBadge,
  voiceEnabled,
  voiceMuted,
  onOpenTheme,
  onOpenChat,
  onToggleVoice,
  onToggleMute,
}: TableTopBarActionsProps) {
  return (
    <View className="ui-row items-center justify-end ui-inline-1">
      <IconButton variant="link" icon={<Icon name="theme" size={20} />} onPress={onOpenTheme} />
      <IconButton variant="link" icon={<Icon name="chat" />} onPress={onOpenChat} badge={chatBadge} />
      <VoiceBarControls
        voiceEnabled={voiceEnabled}
        voiceMuted={voiceMuted}
        onToggleVoice={onToggleVoice}
        onToggleMute={onToggleMute}
      />
    </View>
  );
}
