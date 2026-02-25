import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceChannelLifecycle } from "@/hooks/useVoiceChannelLifecycle";
import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { storeRegistry } from "@/registry/store.registry";
import { LOBBY_VOICE_CHANNEL_ID, LOBBY_VOICE_CAP } from "@/voice/constants/channelIds";
import { showVoiceErrorToast } from "@/voice/errors";

export function useLobbyVoiceControls({ profileUserId }: { profileUserId: string | null | undefined }) {
  const { transportState, lobbyVoiceParticipantIds } = storeRegistry.use.lobby();
  const { lobbyRoom, sendLobby } = useLobbyRealtimeBridge();
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const autoJoinAttemptedRef = useRef(false);
  const hadJoinedLobbyVoiceRef = useRef(false);

  const leaveLobbyVoice = useCallback(() => {
    if (!hadJoinedLobbyVoiceRef.current) return;
    hadJoinedLobbyVoiceRef.current = false;
    sendLobby("LEAVE_LOBBY_VOICE", {});
  }, [sendLobby]);

  const { controllerRef: lobbyVoiceControllerRef } = useVoiceChannelLifecycle({
    room: lobbyRoom,
    channelId: LOBBY_VOICE_CHANNEL_ID,
    selfUserId: profileUserId,
    peerIds: voiceEnabled ? lobbyVoiceParticipantIds : [],
    enabled: voiceEnabled,
    onLeave: leaveLobbyVoice,
    leaveOnAppBackground: true,
    isRealtimeConnected: Boolean(lobbyRoom) && transportState === "CONNECTED",
  });

  const { handleToggleVoice, handleToggleMute } = useVoiceJoinPolicy({
    controllerRef: lobbyVoiceControllerRef,
    autoJoinAttemptedRef,
    voiceEnabled,
    setVoiceEnabled,
    voiceMuted,
    setVoiceMuted,
    voicePrefReady: true,
    heroIsSittingOut: false,
    voiceRoom: lobbyRoom,
    heroUserId: profileUserId,
    showVoiceError: showVoiceErrorToast,
  });

  useEffect(() => {
    if (voiceEnabled) {
      if (!hadJoinedLobbyVoiceRef.current) {
        hadJoinedLobbyVoiceRef.current = true;
        sendLobby("JOIN_LOBBY_VOICE", {});
      }
    } else if (hadJoinedLobbyVoiceRef.current) {
      hadJoinedLobbyVoiceRef.current = false;
      sendLobby("LEAVE_LOBBY_VOICE", {});
    }
  }, [voiceEnabled, sendLobby]);

  const voiceJoinDisabled = !voiceEnabled && lobbyVoiceParticipantIds.length >= LOBBY_VOICE_CAP;

  const onToggleVoice = useCallback(() => {
    if (voiceJoinDisabled && !voiceEnabled) return;
    handleToggleVoice();
  }, [voiceJoinDisabled, voiceEnabled, handleToggleVoice]);

  return {
    voiceEnabled,
    voiceMuted,
    onToggleVoice,
    onToggleMute: handleToggleMute,
    voiceJoinDisabled,
    voiceParticipantCount: lobbyVoiceParticipantIds.length,
    voiceParticipantIds: lobbyVoiceParticipantIds,
  };
}
