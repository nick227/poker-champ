import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Toggle } from "@/components/base/Toggle";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { useAuthStore } from "@/stores/auth.store";
import { postAuthLogout } from "@/services/post/auth.post";
import { useProfile } from "@/hooks/useProfile";
import { useBankroll } from "@/hooks/useBankroll";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useToastStore } from "@/stores/toast.store";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { useLobbyVoiceControls } from "@/hooks/useLobbyVoiceControls";
import { LOBBY_CHAT_SCOPE, LOBBY_CHAT_SCOPE_KEY } from "@/constants/lobbyChat";

export default function SettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const profile = useProfile();
  const bankroll = useBankroll();
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const setSoundEnabled = usePreferencesStore((s) => s.setSoundEnabled);
  const notificationsEnabled = usePreferencesStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((s) => s.setNotificationsEnabled);
  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
    chatMessages,
    chatHasMore,
    chatLoading,
    chatLoadingMore,
    chatLoaded,
    loadInitialLobbyChat,
    loadOlderLobbyChat,
  } = storeRegistry.use.lobby();
  const { requestOnlinePlayers, sendLobby } = useLobbyRealtimeBridge();
  const voice = useLobbyVoiceControls({ profileUserId: profile.userId });
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const handleLogout = async () => {
    const token = useAuthStore.getState().token;
    if (token) await postAuthLogout().catch(() => {});
    logout();
    router.replace("/login");
  };

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const chatMessagesForOverlay = useMemo(
    () =>
      chatMessages.map((m) => ({
        id: m.id,
        sender: m.senderName,
        text: m.text,
        isSelf: profile.userId != null && m.senderUserId === profile.userId,
        createdAtTs: m.createdAtTs,
      })),
    [chatMessages, profile.userId],
  );

  const sendLobbyChat = useCallback(
    (text: string) => {
      const sent = sendLobby("SEND_LOBBY_CHAT", { text });
      if (!sent) {
        useToastStore.getState().show("Lobby chat is offline.", "danger");
      }
    },
    [sendLobby],
  );

  const chatOverlay = useChatOverlay({
    scopeKey: LOBBY_CHAT_SCOPE_KEY,
    messages: chatMessagesForOverlay,
    onSend: sendLobbyChat,
    onLoadOlder: () => {
      void loadOlderLobbyChat();
    },
    hasMore: chatHasMore,
    loadingOlder: chatLoadingMore,
  });

  const onOpenChat = useCallback(() => {
    chatOverlay.setVisible(true);
    if (!chatLoaded && !chatLoading) {
      void loadInitialLobbyChat({ scope: LOBBY_CHAT_SCOPE });
    }
  }, [chatOverlay, chatLoaded, chatLoading, loadInitialLobbyChat]);

  return (
    <Screen>
      <Masthead />
      <ProfileStrip
        username={profile.username ?? "Player"}
        location={profile.location}
        amountCents={bankroll.cents}
        onOpenChat={onOpenChat}
        chatBadge={chatOverlay.unseenCount || undefined}
        voiceEnabled={voice.voiceEnabled}
        voiceMuted={voice.voiceMuted}
        onToggleVoice={voice.onToggleVoice}
        onToggleMute={voice.onToggleMute}
        voiceParticipantCount={voice.voiceParticipantCount}
        voiceJoinDisabled={voice.voiceJoinDisabled}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
      />
      <View className="flex-1 ui-stack-4 ui-p-4">
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Sound</Text>
          <Toggle value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Notifications</Text>
          <Toggle value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
        <Button title="Logout" variant="danger" onPress={handleLogout} />
      </View>
      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        voiceParticipantIds={voice.voiceParticipantIds}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />
      <ChatOverlay
        visible={chatOverlay.visible}
        onClose={chatOverlay.onClose}
        messages={chatOverlay.messages}
        onSend={chatOverlay.onSend}
        onLoadOlder={chatOverlay.onLoadOlder}
        hasMore={chatOverlay.hasMore}
        loadingOlder={chatOverlay.loadingOlder}
      />
      <BottomBar active="settings" />
    </Screen>
  );
}
