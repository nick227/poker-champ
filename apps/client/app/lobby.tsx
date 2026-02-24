import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BankrollDisplay } from "@/components/domain/lobby/BankrollDisplay";
import { GameListHeader } from "@/components/domain/lobby/GameListHeader";
import { GameTableRow } from "@/components/domain/lobby/GameTableRow";
import { EmptyState } from "@/components/domain/lobby/EmptyState";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { CreateGameModal } from "@/components/domain/lobby/CreateGameModal";
import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { TableNotificationBell } from "@/components/domain/table/TableNotificationBell";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { VoiceBarControls } from "@/components/domain/voice/VoiceBarControls";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { Loader } from "@/components/base/Loader";
import { Text } from "@/components/base/Text";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtime } from "@/realtime/useLobbyRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useVoiceChannelLifecycle } from "@/hooks/useVoiceChannelLifecycle";
import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";
import { LOBBY_VOICE_CHANNEL_ID } from "@/voice/constants/channelIds";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";
import { postCreateTable } from "@/services/post/lobby.post";
import { postEconomyDeposit } from "@/services/post/economy.post";
import { useToastStore } from "@/stores/toast.store";
import { normalizeTable } from "@/lib/lobbyTables";
import { confirmDeleteTable } from "@/lib/deleteTable";
import { tablePath } from "@/lib/nav";
import { ChatOverlay } from "@/components/domain/chat/ChatOverlay";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";

type SortKey = "name" | "players" | "blinds";

const SORT_COMPARATORS: Record<SortKey, (a: ReturnType<typeof normalizeTable>, b: ReturnType<typeof normalizeTable>) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  players: (a, b) => b.players - a.players,
  blinds: (a, b) => (a.blinds ?? "").localeCompare(b.blinds ?? ""),
};

const SORT_CYCLE: Record<SortKey, SortKey> = { name: "players", players: "blinds", blinds: "name" };

export default function LobbyScreen() {
  const router = useRouter();
  const {
    tables,
    refresh,
    busy,
    error,
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
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const { cents: bankroll, refresh: refreshBankroll, error: bankrollError, loading: bankrollLoading } = useBankroll();
  const profile = useProfile();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chooseTableModal, setChooseTableModal] = useState<{
    id: string;
    minBuyInCents: number;
    maxBuyInCents: number;
  } | null>(null);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const [lobbyRoom, setLobbyRoom] = useState<TableRealtimeRoom | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const autoJoinAttemptedRef = useRef(false);

  const { requestOnlinePlayers, send: sendLobby } = useLobbyRealtime({ onReadyRoom: setLobbyRoom });
  const hadJoinedLobbyVoiceRef = useRef(false);

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

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh({ background: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const sortedTables = useMemo(() => {
    const rows = tables.map((t: unknown) => normalizeTable(t as Record<string, unknown>));
    return [...rows].sort(SORT_COMPARATORS[sortKey]);
  }, [tables, sortKey]);

  const cycleSort = useCallback(() => setSortKey((k) => SORT_CYCLE[k]), []);

  const handleCreateGame = async (config: Parameters<typeof postCreateTable>[0]) => {
    try {
      await postCreateTable(config);
      refresh();
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Failed to create game", "danger");
    }
  };

  const handleJoinApply = useCallback((opts: { buyInCents: number }) => {
    if (!chooseTableModal) return;
    openTable(chooseTableModal.id, { buyInCents: opts.buyInCents });
    router.push(tablePath(chooseTableModal.id, { buyInCents: opts.buyInCents }));
    setChooseTableModal(null);
  }, [chooseTableModal, openTable, router]);

  const handleDeposit = useCallback(async () => {
    try {
      await postEconomyDeposit();
      await refreshBankroll();
      useToastStore.getState().show("Deposited $1,000", "success");
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Deposit failed", "danger");
    }
  }, [refreshBankroll]);

  const handleDeleteTable = useCallback(
    (tableId: string) => {
      confirmDeleteTable(tableId, {
        onSuccess: () => {
          // Optimistically remove the table from the store so the row disappears immediately.
          storeRegistry.use.lobby.setState((s) => ({
            tables: (s.tables as Array<{ tableId?: string; id?: string }>).filter(
              (t) => (t.tableId ?? t.id) !== tableId,
            ),
          }));
          refresh();
          storeRegistry.tables().closeTable(tableId);
          storeRegistry.table().clearTable(tableId);
        },
      });
    },
    [refresh]
  );

  const activeTableRows = useMemo(() =>
    openTableIds.map((id) => ({ id, potCents: 1480, bankCents: 105950, betCents: 250, isYourTurn: false })),
    [openTableIds]
  );

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
    scopeKey: "lobby:lobby",
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
        <View className="ui-row ui-inline-2">
          <Button variant="ghost" title="My Account" onPress={() => router.push("/settings")} />
          <Button variant="ghost" title="Deposit" onPress={handleDeposit} />
          <TableNotificationBell count={openTableIds.length} onPress={() => setActiveTablesDropdownVisible(true)} />
        </View>
        <BankrollDisplay amountCents={bankroll} />
        <GameListHeader onSort={cycleSort} onCreateGame={() => setCreateModalVisible(true)} sortLabel={`Sort: ${sortKey}`} />
        <View className="flex-1 ui-col gap-3">
        {busy ? (
          <Loader />
        ) : error ? (
          <View className="ui-stack-2 ui-p-4">
            <Button title={`Retry: ${error}`} onPress={refresh} />
          </View>
        ) : sortedTables.length === 0 ? (
          <EmptyState message="No games available. Create one!" />
        ) : (
          sortedTables.map((t) => (
            <GameTableRow
              key={t.id}
              table={t}
              balanceCents={bankroll}
              currentUserId={profile.userId}
              onJoin={() => setChooseTableModal({ id: t.id, minBuyInCents: t.minBuyInCents, maxBuyInCents: t.maxBuyInCents })}
              onDelete={handleDeleteTable}
            />
          ))
        )}
        </View>
      <CreateGameModal visible={createModalVisible} onClose={() => setCreateModalVisible(false)} onSubmit={handleCreateGame} />
      {chooseTableModal && (
        <ChooseTableModal
          visible
          onClose={() => setChooseTableModal(null)}
          balanceCents={bankroll}
          minBuyInCents={chooseTableModal.minBuyInCents}
          maxBuyInCents={Math.min(chooseTableModal.maxBuyInCents, bankroll)}
          onApply={handleJoinApply}
        />
      )}
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
      <BottomBar active="lobby" />
    </Screen>
  );
}
