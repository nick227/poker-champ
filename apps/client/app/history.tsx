import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Pressable } from "react-native";

import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
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
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { useLobbyVoiceControls } from "@/hooks/useLobbyVoiceControls";
import { LOBBY_CHAT_SCOPE, LOBBY_CHAT_SCOPE_KEY } from "@/constants/lobbyChat";

import { BankrollDisplay } from "@/components/domain/lobby/BankrollDisplay";
import { useBankroll } from "@/hooks/useBankroll";
import { postEconomyDeposit } from "@/services/post/economy.post";

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

  const profile = useProfile();
  const voice = useLobbyVoiceControls({ profileUserId: profile.userId });
  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();
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

  const {
    cents: bankroll,
    refresh: refreshBankroll,
  } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);
  
    const handleDeposit = useCallback(async () => {
      try {
        await postEconomyDeposit();
        await refreshBankroll();
        useToastStore.getState().show("Deposited $1,000", "success");
      } catch (e) {
        useToastStore.getState().show((e as Error).message ?? "Deposit failed", "danger");
      }
    }, [refreshBankroll]);

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

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
        amountCents={currentBankroll} onDeposit={handleDeposit}
      />

      <View className="flex-1 ui-stack-3">

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

      <BottomBar active="history" />
    </Screen>
  );
}
