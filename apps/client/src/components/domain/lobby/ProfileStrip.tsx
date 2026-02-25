import { View, Pressable } from "react-native";
import { useCallback } from "react";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";
import { TableNotificationBell } from "@/components/domain/table/TableNotificationBell";
import { router } from "expo-router";
import { TABLE } from "@/constants/copy";
import { formatCents } from "@/lib/format";

export function ProfileStrip({
  username,
  location,
  onOpenChat,
  chatBadge,
  voiceEnabled = false,
  voiceMuted = false,
  onToggleVoice,
  onToggleMute,
  voiceParticipantCount = 0,
  voiceJoinDisabled = false,
  onlineLabel = "Online",
  onPressOnline,
  tableNotificationCount,
  onTableNotifications,
  amountCents,
  onDeposit,
}: {
  username: string;
  location?: string;
  onOpenChat?: () => void;
  chatBadge?: number;
  voiceEnabled?: boolean;
  voiceMuted?: boolean;
  onToggleVoice?: () => void;
  onToggleMute?: () => void;
  voiceParticipantCount?: number;
  voiceJoinDisabled?: boolean;
  onlineLabel?: string;
  onPressOnline?: () => void;
  tableNotificationCount?: number;
  onTableNotifications?: () => void;
  amountCents: number;
  onDeposit?: () => void;
}) {
  const goSettings = useCallback(() => {
    router.push("/settings");
  }, []);

  return (
    <View className="py-4 ui-section mb-2 ui-row items-center justify-between ui-inline-3">
      <View className="ui-row items-center ui-inline-3 flex-1">

        {/* Avatar */}
        <Pressable
          onPress={goSettings}
          className="h-10 w-10 rounded-full ui-surface ui-center border border-border-subtle"
        >
          <Text numberOfLines={1} variant="body">
            {username.slice(0, 1).toUpperCase()}
          </Text>
        </Pressable>

        {/* Username + Location */}
        <Pressable
          onPress={goSettings}
          className="flex-1"
        >
          <Text numberOfLines={1} variant="body">
            {username}
          </Text>
          <Text variant="h2" className="font-semibold">{formatCents(amountCents)}</Text>
          {location ? (
            <Text numberOfLines={1} variant="muted">
              {location}
            </Text>
          ) : null}
        </Pressable>

      </View>

      {onDeposit ? (
        <Button variant="ghost" title="Deposit" onPress={onDeposit} />
      ) : null}

      <View className="ui-col items-end gap-1">
        <View className="ui-row items-center gap-2">
          <IconButton
            variant="link"
            icon={<Icon name="chat" />}
            onPress={onOpenChat ?? (() => { })}
            disabled={!onOpenChat}
            badge={chatBadge}
          />
          <VoiceBarControls
            voiceEnabled={voiceEnabled}
            voiceMuted={voiceMuted}
            onToggleVoice={onToggleVoice ?? (() => { })}
            onToggleMute={onToggleMute ?? (() => { })}
            participantCount={voiceParticipantCount}
            joinDisabled={voiceJoinDisabled || !onToggleVoice}
          />
          <Button
            variant="link"
            title={onlineLabel}
            onPress={onPressOnline ?? (() => { })}
            disabled={!onPressOnline}
          />
          {onTableNotifications && (
            <TableNotificationBell
              count={tableNotificationCount || 0}
              onPress={onTableNotifications}
            />
          )}
        </View>
      </View>
    </View>
  );
}
