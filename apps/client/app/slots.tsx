import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BankrollDisplay } from "@/components/domain/lobby/BankrollDisplay";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { Button } from "@/components/base/Button";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { storeRegistry } from "@/registry/store.registry";
import { tablePath } from "@/lib/nav";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { useLobbyVoiceControls } from "@/hooks/useLobbyVoiceControls";
import { useToastStore } from "@/stores/toast.store";
import { postEconomyDeposit } from "@/services/post/economy.post";
import { LOBBY_CHAT_SCOPE, LOBBY_CHAT_SCOPE_KEY } from "@/constants/lobbyChat";

export default function SlotsScreen() {
  const router = useRouter();
  const profile = useProfile();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const {
    cents: bankroll,
    refresh: refreshBankroll,
  } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const voice = useLobbyVoiceControls({ profileUserId: profile.userId });

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

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

  const handleDeposit = useCallback(async () => {
    try {
      await postEconomyDeposit();
      await refreshBankroll();
      useToastStore.getState().show("Deposited $1,000", "success");
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Deposit failed", "danger");
    }
  }, [refreshBankroll]);

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

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const activeTableRows = useMemo(
    () =>
      openTableIds.map((id) => ({
        id,
        potCents: 1480,
        bankCents: 105950,
        betCents: 250,
        isYourTurn: false,
      })),
    [openTableIds],
  );

  const currentBankroll = slotBankroll ?? 0;

  return (
    <Screen>
      <Masthead />
      <ProfileStrip
        username={profile.username ?? "Player"}
        location={profile.location}
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
        tableNotificationCount={openTableIds.length}
        onTableNotifications={() => setActiveTablesDropdownVisible(true)}
      />

      <BankrollDisplay amountCents={currentBankroll} onDeposit={handleDeposit} />

      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="slot-machine-container justify-start" style={{ flex: 1, minHeight: 900 }}>
            <ThemeProvider initialThemeId="poker-champ-dark">
              <SlotMachine bankrollCents={currentBankroll} onBankrollChange={setSlotBankroll} />
            </ThemeProvider>
          </View>
        </ScrollView>
      </View>

      <ActiveTablesDropdown
        visible={activeTablesDropdownVisible}
        onClose={() => setActiveTablesDropdownVisible(false)}
        tables={activeTableRows}
        onSelectTable={(id) => {
          setActive(id);
          router.push(tablePath(id));
          setActiveTablesDropdownVisible(false);
        }}
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
      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        voiceParticipantIds={voice.voiceParticipantIds}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />

      <BottomBar active="lobby" />
    </Screen>
  );
}
