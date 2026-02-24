import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";

export type TableTopBarActionsProps = {
  showAddBot: boolean;
  addBotPending: boolean;
  chatBadge?: number;
  voiceEnabled: boolean;
  voiceMuted: boolean;
  onAddBot: () => void;
  onOpenTheme: () => void;
  onOpenChat: () => void;
  onToggleVoice: () => void;
  onToggleMute: () => void;
};

export function TableTopBarActions({
  showAddBot,
  addBotPending,
  chatBadge,
  voiceEnabled,
  voiceMuted,
  onAddBot,
  onOpenTheme,
  onOpenChat,
  onToggleVoice,
  onToggleMute,
}: TableTopBarActionsProps) {
  return (
    <View className="ui-row ui-inline-1">
      {showAddBot ? (
        <Button minWidth={100} marginRight={14} marginLeft={33} variant="primary" title="+ Bot" onPress={onAddBot} loading={addBotPending} />
      ) : null}
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
