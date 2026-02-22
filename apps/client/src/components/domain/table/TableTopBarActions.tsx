import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";

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
  onCloseTable: () => void;
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
  onCloseTable,
}: TableTopBarActionsProps) {
  return (
    <View className="ui-row ui-inline-1">
      {showAddBot ? (
        <Button minWidth={160} variant="link" title="+ Bot" onPress={onAddBot} loading={addBotPending} />
      ) : null}
      <IconButton variant="link" icon={<Icon name="theme" size={20} />} onPress={onOpenTheme} />
      <IconButton variant="link" icon={<Icon name="chat" />} onPress={onOpenChat} badge={chatBadge} />
      <Button variant="link" title={voiceEnabled ? "Stop Voice" : "Join Voice"} onPress={onToggleVoice} />
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
      <>
        <Button variant="link" title={voiceMuted ? "\u{1F507}" : "\u{1F508}"} onPress={onToggleMute} />
        <Button variant="link" title="X" onPress={onCloseTable} />
      </>
    </View>
  );
}
