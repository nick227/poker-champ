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
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { TableNotificationBell } from "@/components/domain/table/TableNotificationBell";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { storeRegistry } from "@/registry/store.registry";
import { tablePath } from "@/lib/nav";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useLobbyRealtime } from "@/realtime/useLobbyRealtime";
import { useVoiceChannelLifecycle } from "@/hooks/useVoiceChannelLifecycle";
import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";
import { LOBBY_VOICE_CHANNEL_ID } from "@/voice/constants/channelIds";
import { useToastStore } from "@/stores/toast.store";
import { postEconomyDeposit } from "@/services/post/economy.post";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";

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
  const [lobbyRoom, setLobbyRoom] = useState<TableRealtimeRoom | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const autoJoinAttemptedRef = useRef(false);

  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
    transportState,
    lobbyVoiceParticipantIds,
    chatMessages,
    chatHasMore,
    chatLoading,
    chatLoadingMore,
    chatLoaded,
    loadInitialLobbyChat,
    loadOlderLobbyChat,
  } = storeRegistry.use.lobby();
  const { send: sendLobby } = useLobbyRealtime({ onReadyRoom: setLobbyRoom });
  const hadJoinedLobbyVoiceRef = useRef(false);

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
    scopeKey: "lobby:slots",
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
      void loadInitialLobbyChat();
    }
  }, [chatOverlay, chatLoaded, chatLoading, loadInitialLobbyChat]);

  const leaveLobbyVoice = useCallback(() => {
    if (!hadJoinedLobbyVoiceRef.current) return;
    hadJoinedLobbyVoiceRef.current = false;
    sendLobby("LEAVE_LOBBY_VOICE", {});
  }, [sendLobby]);

  const { controllerRef: lobbyVoiceControllerRef } = useVoiceChannelLifecycle({
    room: lobbyRoom,
    channelId: LOBBY_VOICE_CHANNEL_ID,
    selfUserId: profile.userId,
    peerIds: voiceEnabled ? lobbyVoiceParticipantIds : [],
    enabled: voiceEnabled,
    onLeave: leaveLobbyVoice,
    leaveOnAppBackground: true,
    isRealtimeConnected: Boolean(lobbyRoom) && transportState === "CONNECTED",
  });

  const showVoiceError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const looksPermissionDenied =
      message.includes("MIC_PERMISSION_DENIED") ||
      message.includes("NotAllowedError") ||
      /notallowederror|permission denied|permission/i.test(message.toLowerCase());
    if (looksPermissionDenied) {
      useToastStore.getState().show("Microphone permission denied", "danger");
      return;
    }
    useToastStore.getState().show("Voice unavailable. Check microphone permissions.", "danger");
  }, []);

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
    heroUserId: profile.userId,
    showVoiceError,
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

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    // Request online players - need to implement this in slots context
  }, []);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;
  const LOBBY_VOICE_CAP = 8;
  const lobbyVoiceFull = !voiceEnabled && lobbyVoiceParticipantIds.length >= LOBBY_VOICE_CAP;

  const onLobbyToggleVoice = useCallback(() => {
    if (lobbyVoiceFull && !voiceEnabled) return;
    handleToggleVoice();
  }, [lobbyVoiceFull, voiceEnabled, handleToggleVoice]);

  const profileRightAction = useMemo(
    () => (
      <View className="ui-col items-end gap-1">
        <View className="ui-row items-center gap-2">
          <IconButton
            variant="link"
            icon={<Icon name="chat" />}
            onPress={onOpenChat}
            badge={chatOverlay.unseenCount || undefined}
          />
          <VoiceBarControls
            voiceEnabled={voiceEnabled}
            voiceMuted={voiceMuted}
            onToggleVoice={onLobbyToggleVoice}
            onToggleMute={handleToggleMute}
            participantCount={lobbyVoiceParticipantIds.length}
            joinDisabled={lobbyVoiceFull}
          />
          <Button variant="link" title={onlineLabel} onPress={openOnlineSheet} />
        </View>
      </View>
    ),
    [
      chatOverlay.unseenCount,
      onOpenChat,
      voiceEnabled,
      voiceMuted,
      onLobbyToggleVoice,
      handleToggleMute,
      lobbyVoiceParticipantIds.length,
      lobbyVoiceFull,
      onlineLabel,
      openOnlineSheet,
    ],
  );

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
        rightAction={profileRightAction}
      />

      <View className="ui-row ui-inline-2 ui-section-tight">
        <Button variant="ghost" title="My Account" onPress={() => router.push("/settings")} />
        <Button variant="ghost" title="Deposit" onPress={handleDeposit} />
        <TableNotificationBell count={openTableIds.length} onPress={() => setActiveTablesDropdownVisible(true)} />
      </View>

      <BankrollDisplay amountCents={currentBankroll} />

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
        loading={onlineBusy}
        error={onlineError}
        onRefresh={() => {}}
      />

      <BottomBar active="lobby" />
    </Screen>
  );
}
