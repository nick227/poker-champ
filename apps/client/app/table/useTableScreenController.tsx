import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { TableTopBarActions } from "@/components/domain/table/TableTopBarActions";
import { getHeroDisplayStatus, mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import type { Opponent, ConnectionStatus } from "@/components/domain/table/TableLayout";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { Button } from "@/components/base/Button";
import { storeRegistry } from "@/registry/store.registry";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useToastStore } from "@/stores/toast.store";
import { lobbyPath, loginPathWithNext, tablePath } from "@/lib/nav";
import { normalizeTable } from "@/lib/lobbyTables";
import { loadVoicePreference, saveVoicePreference } from "@/lib/voicePreferenceStorage";
import { playSound } from "@/lib/sound";
import { MODAL, TABLE } from "@/constants/copy";
import { useResolvedBuyIn } from "@/components/domain/table/hooks/useResolvedBuyIn";
import { useTableScene } from "@/components/domain/table/hooks/useTableScene";
import { useActionMessages } from "@/components/domain/table/hooks/useActionMessages";
import { useChatOverlay } from "@/components/domain/table/hooks/useChatOverlay";
import { useRebuySheet } from "@/components/domain/table/hooks/useRebuySheet";
import { useAddBot } from "@/components/domain/table/hooks/useAddBot";
import { useVoiceControllerLifecycle } from "@/components/domain/table/hooks/useVoiceControllerLifecycle";
import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";
import { useOpenTableSync } from "@/components/domain/table/hooks/useOpenTableSync";
import { useTableConnection } from "@/components/domain/table/hooks/useTableConnection";
import { useTableScreenStores } from "@/hooks/useTableScreenStores";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TableScreenController } from "@/types/tableSceneContract";

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

type UseTableScreenControllerParams = {
  id?: string;
  buyInCentsParam?: string;
};

export function useTableScreenController({
  id,
  buyInCentsParam,
}: UseTableScreenControllerParams): TableScreenController {
  const router = useRouter();
  const tableId = id ? String(id) : "demo";

  const {
    openTableIds,
    activeTableId,
    openTable,
    closeTable,
    setActive,
    persistedRoomId,
    persistedBuyInCents,
    dispatchTableAction,
    dispatchSendChat,
    dispatchListBots,
    dispatchAddBot,
    dispatchRemoveBot,
    joinState,
    lobbyTables,
    snapshotsByTableId,
    chatMessagesByTableId,
    botSummariesByTableId,
    botSummariesUpdatedAtByTableId,
    connectionStatusByTableId: tableStatusByTableId,
    errorByTableId: tableErrorByTableId,
    hydrated: authHydrated,
    token: authToken,
  } = useTableScreenStores(tableId);

  const normalizedLobbyTables = useMemo(
    () => lobbyTables.map((t) => normalizeTable(t as Record<string, unknown>)) as LobbyTableRow[],
    [lobbyTables],
  );

  const { buyInCents, routeBuyInCents } = useResolvedBuyIn({
    tableId,
    buyInCentsParam,
    joinStateBuyInCents: joinState?.buyInCents,
    persistedBuyInCents,
    lobbyTables,
  });

  const { cents: balanceCents, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();
  const lobbyTable = useMemo(
    () => normalizedLobbyTables.find((t) => t.id === tableId),
    [normalizedLobbyTables, tableId],
  );
  const canDeleteTable =
    Boolean(profile.userId && lobbyTable?.creatorId === profile.userId && (lobbyTable?.connectedHumanCount ?? 0) === 0);

  const closeTableAndReturn = useCallback(() => {
    if (id) {
      closeTable(String(id));
      storeRegistry.table().clearTable(String(id));
    }
    router.replace(lobbyPath());
  }, [id, closeTable, router]);

  const [playerPopup, setPlayerPopup] = useState<{ name: string } | null>(null);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [voiceRoom, setVoiceRoom] = useState<TableRealtimeRoom | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voicePrefReady, setVoicePrefReady] = useState(false);
  const outOfChipsNoticeShownForHandIdRef = useRef<string | null>(null);
  const autoJoinAttemptedRef = useRef(false);

  const snapshot = snapshotsByTableId[tableId];
  const snapshotSeats = snapshot?.seats;
  const tableStatus = tableStatusByTableId[tableId] ?? "DISCONNECTED";
  const connectionStatus = tableStatus as ConnectionStatus;
  const tableError = tableErrorByTableId[tableId];
  const opponents = useMemo(() => (snapshot ? mapSeatsToOpponents(snapshot) : []), [snapshot]);
  const heroUserId = snapshot?.hero?.userId;
  const chatMessagesForOverlay = useMemo(() => {
    const list = chatMessagesByTableId[tableId] ?? [];
    return list.map((m) => ({
      id: m.id,
      sender: m.senderName,
      text: m.text,
      isSelf: heroUserId != null && m.senderUserId === heroUserId,
    }));
  }, [chatMessagesByTableId, tableId, heroUserId]);

  const sendChat = useCallback(
    (text: string) => dispatchSendChat({ tableId, text }),
    [tableId, dispatchSendChat],
  );
  const chatOverlay = useChatOverlay(tableId, chatMessagesForOverlay, { onSend: sendChat });

  const { actionMessage, handResultMessage } = useActionMessages(tableId, snapshot);

  const { sceneMode, tableTopBarFlags } = useTableScene({
    authHydrated,
    hasAuthToken: Boolean(authToken),
    hasSnapshot: Boolean(snapshot),
    hasActiveHand: Boolean(snapshot?.hand),
    canDeleteTable,
    canAddBot: Boolean(snapshot?.hero.youAreSeated && buyInCents),
  });

  const {
    rebuySheetVisible,
    setRebuySheetVisible,
    canRebuy,
    handleRebuyApply,
  } = useRebuySheet(tableId, snapshot, refreshBankroll);

  const { addBotPending, botPickerVisible, botPickerLoading, handleAddBotPress, handleBotPick, closeBotPicker } = useAddBot({
    tableId,
    buyInCents,
    dispatchAddBot,
    dispatchListBots,
    botSummaries: botSummariesByTableId[tableId] ?? [],
    botSummariesUpdatedAtTs: botSummariesUpdatedAtByTableId[tableId],
    snapshot,
  });

  useEffect(() => {
    let active = true;
    void loadVoicePreference()
      .then((pref) => {
        if (!active) return;
        setVoiceEnabled(pref.enabled);
        setVoiceMuted(pref.muted);
      })
      .finally(() => {
        if (active) setVoicePrefReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!voicePrefReady) return;
    void saveVoicePreference({ enabled: voiceEnabled, muted: voiceMuted });
  }, [voiceEnabled, voiceMuted, voicePrefReady]);

  const refreshLobby = useCallback(() => storeRegistry.lobby().refresh(), []);

  useOpenTableSync({
    tableId,
    routeBuyInCents,
    joinStateBuyInCents: joinState?.buyInCents,
    openTableIds,
    activeTableId,
    openTable,
    setActive,
    lobbyTableCount: lobbyTables.length,
    refreshLobby,
  });

  const activeTableRows = useMemo(
    () =>
      openTableIds.map((oid) => {
        const s = snapshotsByTableId[oid];
        const heroSeatForTable = s?.hero.seat != null ? s.seats.find((seat) => seat.seat === s.hero.seat) : undefined;
        return {
          id: oid,
          potCents: s?.hand?.potCents ?? s?.lastHandResult?.potCents ?? 0,
          bankCents: heroSeatForTable?.stackCents ?? 0,
          betCents: heroSeatForTable?.roundBetCents ?? 0,
          isYourTurn: Boolean(heroSeatForTable?.isToAct),
        };
      }),
    [openTableIds, snapshotsByTableId],
  );

  const selectTableFromDropdown = useCallback(
    (targetId: string) => {
      setActive(targetId);
      router.push(tablePath(targetId));
      setActiveTablesDropdownVisible(false);
    },
    [setActive, router],
  );

  const selectTableTab = useCallback(
    (targetId: string) => {
      setActive(targetId);
      router.push(tablePath(targetId));
    },
    [setActive, router],
  );

  const tableNextPath = useMemo(
    () => tablePath(tableId, routeBuyInCents ? { buyInCents: routeBuyInCents } : undefined),
    [tableId, routeBuyInCents],
  );

  const goToLogin = useCallback(() => {
    router.replace(loginPathWithNext(tableNextPath));
  }, [router, tableNextPath]);

  useEffect(() => {
    if (!authHydrated) return;
    if (authToken) return;
    goToLogin();
  }, [authHydrated, authToken, goToLogin]);

  const handleRealtimeError = useCallback((message: string) => {
    console.log("TABLE_REALTIME_ERROR", message);
  }, []);

  const handleTableGone = useCallback(() => {
    useToastStore.getState().show(TABLE.tableGone, "danger");
    closeTable(tableId);
    storeRegistry.table().clearTable(tableId);
    router.replace(lobbyPath());
  }, [tableId, closeTable, router]);

  const { hasValidBuyIn } = useTableConnection({
    tableId,
    persistedRoomId,
    normalizedLobbyTables,
    buyInCents,
    authHydrated,
    hasAuthToken: Boolean(authToken),
    onError: handleRealtimeError,
    onTableGone: handleTableGone,
    onReadyRoom: setVoiceRoom,
  });

  const resetVoiceAutoJoinAttempt = useCallback(() => {
    autoJoinAttemptedRef.current = false;
  }, []);

  const { controllerRef: voiceControllerRef } = useVoiceControllerLifecycle({
    tableId,
    heroUserId,
    voiceRoom,
    seats: snapshotSeats,
    onLifecycleReset: resetVoiceAutoJoinAttempt,
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

  const heroSeat = snapshot?.hero?.seat != null ? snapshot.seats?.find((s) => s.seat === snapshot.hero.seat) : undefined;
  const heroStackCents = heroSeat?.stackCents ?? -1;
  const heroStatus = heroSeat?.status ?? "";
  const heroDisplayStatus = useMemo(
    () => (snapshot ? getHeroDisplayStatus(snapshot) : "SITTING_OUT"),
    [snapshot],
  );
  const heroIsSittingOut = heroDisplayStatus === "SITTING_OUT";

  const { handleToggleVoice, handleToggleMute } = useVoiceJoinPolicy({
    controllerRef: voiceControllerRef,
    autoJoinAttemptedRef,
    voiceEnabled,
    setVoiceEnabled,
    voiceMuted,
    setVoiceMuted,
    voicePrefReady,
    heroIsSittingOut,
    voiceRoom,
    heroUserId,
    showVoiceError,
  });

  const sendAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
      const ok = dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (ok) {
        playSound(action);
      } else {
        console.log("TABLE_ACTION_FALLBACK", { action, tableId, reason: "sender-not-registered-or-invalid-payload" });
      }
    },
    [tableId, dispatchTableAction],
  );

  const onPlayerPress = useCallback(
    (o: Opponent) => {
      if (o.isBot) {
        dispatchRemoveBot({ tableId, botId: o.id });
      } else {
        setPlayerPopup({ name: o.name });
      }
    },
    [dispatchRemoveBot, tableId],
  );

  const openChat = useCallback(() => {
    chatOverlay.setVisible(true);
  }, [chatOverlay]);

  const tableTopBarRight = useMemo(
    () => (
      <TableTopBarActions
        showAddBot={tableTopBarFlags.showAddBot}
        addBotPending={addBotPending}
        chatBadge={chatOverlay.unseenCount || undefined}
        voiceEnabled={voiceEnabled}
        voiceMuted={voiceMuted}
        onAddBot={handleAddBotPress}
        onOpenTheme={() => setThemePickerVisible(true)}
        onOpenChat={openChat}
        onToggleVoice={handleToggleVoice}
        onToggleMute={handleToggleMute}
        onCloseTable={closeTableAndReturn}
      />
    ),
    [
      tableTopBarFlags.showAddBot,
      addBotPending,
      chatOverlay.unseenCount,
      voiceEnabled,
      voiceMuted,
      handleAddBotPress,
      handleToggleVoice,
      handleToggleMute,
      closeTableAndReturn,
      openChat,
    ],
  );

  const activeOrLastHandId = snapshot?.hand?.handId ?? snapshot?.lastHandResult?.handId ?? null;
  const outOfChipsHandId = useMemo(() => {
    if (!snapshot?.hero.youAreSeated || activeOrLastHandId == null) return null;
    if (heroStackCents > 0 || (heroStatus !== "OUT" && heroStatus !== "ABANDONED")) return null;
    return activeOrLastHandId;
  }, [snapshot?.hero.youAreSeated, heroStackCents, heroStatus, activeOrLastHandId]);

  useEffect(() => {
    if (outOfChipsHandId == null) return;
    if (outOfChipsNoticeShownForHandIdRef.current === outOfChipsHandId) return;
    outOfChipsNoticeShownForHandIdRef.current = outOfChipsHandId;
    useToastStore.getState().show("You are out of chips and sitting out. Add chips to continue.", "danger");
  }, [outOfChipsHandId]);

  useEffect(() => {
    if (!tableError) return;
    if (/INSUFFICIENT_BANKROLL|Insufficient bankroll/i.test(tableError)) {
      useToastStore.getState().show("Insufficient bankroll for this table. Deposit or choose a lower buy-in.", "danger");
      return;
    }
    if (/SESSION_REPLACED|Session replaced by a newer connection/i.test(tableError)) {
      return;
    }
    useToastStore.getState().show(tableError, "danger");
  }, [tableError]);

  return {
    scene: {
      mode: sceneMode,
      tableNextPath,
      hasValidBuyIn,
      tableStatus,
      connectionStatus,
      tableError,
    },
    renderModel: {
      openTableIds,
      activeTableId,
      profileUsername: profile.username,
      balanceCents,
      snapshot,
      opponents,
      actionMessage: actionMessage ?? undefined,
      handResultMessage: handResultMessage ?? undefined,
      canRebuy,
      tableTopBarRight,
      activeTableRows,
      chatMessages: chatOverlay.messages,
      chatVisible: chatOverlay.visible,
      botSummaries: botSummariesByTableId[tableId] ?? [],
    },
    uiState: {
      activeTablesDropdownVisible,
      themePickerVisible,
      rebuySheetVisible,
      botPickerVisible,
      botPickerLoading,
      playerPopup,
    },
    actions: {
      goToLogin,
      goToLobby: () => router.replace(lobbyPath()),
      closeTableAndReturn,
      selectTableFromDropdown,
      selectTableTab,
      openMoreTables: () => setActiveTablesDropdownVisible(true),
      closeActiveTablesDropdown: () => setActiveTablesDropdownVisible(false),
      openThemePicker: () => setThemePickerVisible(true),
      closeThemePicker: () => setThemePickerVisible(false),
      closeBotPicker,
      openRebuySheet: () => setRebuySheetVisible(true),
      closeRebuySheet: () => setRebuySheetVisible(false),
      applyRebuy: (rebuyBuyInCents: number) => {
        void handleRebuyApply(rebuyBuyInCents);
        setRebuySheetVisible(false);
      },
      closePlayerPopup: () => setPlayerPopup(null),
      onPlayerPress,
      pickBot: handleBotPick,
      sendAction,
      closeChat: chatOverlay.onClose,
      sendChat: chatOverlay.onSend,
    },
  };
}
