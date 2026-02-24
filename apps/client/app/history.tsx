import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Pressable } from "react-native";

import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Button } from "@/components/base/Button";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";
import { HandList } from "@/components/domain/history/HandList";
import { HandDetailModal } from "@/components/domain/history/HandDetailModal";
import { HistoryOverviewTab } from "@/components/domain/history/HistoryOverviewTab";
import { ReplaySheet } from "@/components/replay/ReplaySheet";
import type { ReplaySource } from "@/components/replay/replay.types";

import { historyService, type HistoryOverview } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";
import { useToastStore } from "@/stores/toast.store";
import { useProfile } from "@/hooks/useProfile";
import { useLobbyRealtime } from "@/realtime/useLobbyRealtime";
import { useVoiceChannelLifecycle } from "@/hooks/useVoiceChannelLifecycle";
import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";
import { LOBBY_VOICE_CHANNEL_ID } from "@/voice/constants/channelIds";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";

type HistoryTab = "overview" | "hands";

function HistoryTabs({
  activeTab,
  onChange,
}: {
  activeTab: HistoryTab;
  onChange: (tab: HistoryTab) => void;
}) {
  return (
    <View className="ui-row ui-border-b border-border">
      {(["overview", "hands"] as HistoryTab[]).map((tab) => {
        const active = activeTab === tab;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            className={`flex-1 py-3 items-center ${active ? "border-b-2 border-primary" : ""}`}
          >
            <Text variant={active ? "body" : "muted"}>
              {tab === "overview" ? "Overview" : "Hands"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HandHistoryScreen() {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [overview, setOverview] = useState<HistoryOverview | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [replaySheetSource, setReplaySheetSource] = useState<ReplaySource | null>(null);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const [lobbyRoom, setLobbyRoom] = useState<TableRealtimeRoom | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const autoJoinAttemptedRef = useRef(false);

  const profile = useProfile();
  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();
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

  const { requestOnlinePlayers, send: sendLobby } = useLobbyRealtime({ onReadyRoom: setLobbyRoom });
  const hadJoinedLobbyVoiceRef = useRef(false);

  const loadOverview = useCallback(async () => {
    if (!token) return;

    try {
      setOverview(await historyService.getOverview({ token }));
    } catch {
      setOverview(null);
    }
  }, [token]);

  const loadHands = useCallback(
    async (cursor?: string) => {
      if (!token) return;

      const store = storeRegistry.history();

      try {
        store.setIsLoading(true);
        store.setError(null);

        const res = await historyService.getHands({
          token,
          cursor,
          limit: 50,
        });

        cursor ? store.appendHands(res.hands) : store.setHands(res.hands);
        store.setCursor(res.nextCursor);
        store.setHasMore(res.nextCursor !== null);
      } catch {
        store.setError("Failed to load hands");
      } finally {
        store.setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    loadOverview();
    loadHands();
  }, [token, loadOverview, loadHands]);

  const loadMoreHands = () => {
    const store = storeRegistry.history();
    if (store.cursor && store.hasMore && !store.isLoading) {
      loadHands(store.cursor);
    }
  };

  const openHand = async (handId: string) => {
    if (!token) return;

    const store = storeRegistry.history();

    try {
      store.setIsLoadingDetail(true);
      store.setDetailError(null);

      const hand = await historyService.getHandDetail({ token, handId });
      store.setSelectedHand(hand);
      setSelectedHandId(handId);
    } catch {
      store.setDetailError("Failed to load hand details");
    } finally {
      store.setIsLoadingDetail(false);
    }
  };

  const closeHand = () => {
    storeRegistry.history().setSelectedHand(null);
    setSelectedHandId(null);
  };

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
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;
  const LOBBY_VOICE_CAP = 8;
  const lobbyVoiceFull = !voiceEnabled && lobbyVoiceParticipantIds.length >= LOBBY_VOICE_CAP;

  const onLobbyToggleVoice = useCallback(() => {
    if (lobbyVoiceFull && !voiceEnabled) return;
    handleToggleVoice();
  }, [lobbyVoiceFull, voiceEnabled, handleToggleVoice]);

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
    scopeKey: "lobby:history",
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

  const chatBadge = chatOverlay.unseenCount || undefined;

  const profileRightAction = useMemo(
    () => (
      <View className="ui-col items-end gap-1">
        <View className="ui-row items-center gap-2">
          <IconButton variant="link" icon={<Icon name="chat" />} onPress={onOpenChat} badge={chatBadge} />
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
      voiceEnabled,
      voiceMuted,
      onLobbyToggleVoice,
      handleToggleMute,
      lobbyVoiceParticipantIds.length,
      lobbyVoiceFull,
      onlineLabel,
      openOnlineSheet,
      onOpenChat,
      chatBadge,
    ],
  );

  return (
    <Screen>
      <Masthead />
      <ProfileStrip
        username={profile.username ?? "Player"}
        location={profile.location}
        rightAction={profileRightAction}
      />

      <View className="flex-1 ui-stack-3">
        <View className="ui-header">
          <Text variant="h1" className="text-center py-4">
            History
          </Text>
        </View>

        <HistoryTabs activeTab={activeTab} onChange={setActiveTab} />

        <View className="flex-1">
          {activeTab === "overview" && <HistoryOverviewTab overview={overview} />}

          {activeTab === "hands" && (
            <HandList
              hands={historyStore.hands}
              isLoading={historyStore.isLoading}
              hasMore={historyStore.hasMore}
              onLoadMore={loadMoreHands}
              onHandPress={openHand}
              onReplayPress={(handId) => setReplaySheetSource({ type: "handId", handId })}
              error={historyStore.error}
            />
          )}
        </View>
      </View>

      <HandDetailModal
        visible={!!selectedHandId}
        hand={historyStore.selectedHand}
        onClose={closeHand}
        currentUserId={profile.userId ?? ""}
        onReplayPress={(handId) => setReplaySheetSource({ type: "handId", handId })}
      />

      <ReplaySheet
        visible={!!replaySheetSource}
        source={replaySheetSource}
        onClose={() => setReplaySheetSource(null)}
      />

      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
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

      <BottomBar active="history" />
    </Screen>
  );
}
