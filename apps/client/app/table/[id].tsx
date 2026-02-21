import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { MultiTableTabs } from "@/components/domain/table/MultiTableTabs";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { TableLayout } from "@/components/domain/table/TableLayout";
import type { Opponent } from "@/components/domain/table/TableLayout";
import { EmptyTableView } from "@/components/domain/table/EmptyTableView";
import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { ConnectingTableShell } from "@/components/domain/table/ConnectingTableShell";
import { TableTopBar } from "@/components/domain/table/TableTopBar";
import { PlayerHistoryPopup } from "@/components/domain/table/PlayerHistoryPopup";
import { ChatOverlay } from "@/components/domain/table/ChatOverlay";
import { getHeroDisplayStatus, mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { storeRegistry } from "@/registry/store.registry";
import { useTableRealtime } from "@/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useToastStore } from "@/stores/toast.store";
import { lobbyPath, loginPathWithNext, tablePath } from "@/lib/nav";
import { normalizeTable } from "@/lib/lobbyTables";
import { confirmDeleteTable } from "@/lib/deleteTable";
import { loadVoicePreference, saveVoicePreference } from "@/lib/voicePreferenceStorage";
import { playSound } from "@/lib/sound";
import { MODAL, TABLE } from "@/constants/copy";
import { useResolvedBuyIn } from "@/components/domain/table/hooks/useResolvedBuyIn";
import { useTableScene } from "@/components/domain/table/hooks/useTableScene";
import { ThemePickerSheet } from "@/components/domain/table/ThemePickerSheet";
import { useActionMessages } from "@/components/domain/table/hooks/useActionMessages";
import { useChatOverlay } from "@/components/domain/table/hooks/useChatOverlay";
import { useRebuySheet } from "@/components/domain/table/hooks/useRebuySheet";
import { useAddBot } from "@/components/domain/table/hooks/useAddBot";
import { useTableScreenStores } from "@/hooks/useTableScreenStores";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { createVoiceController } from "@/voice/client/create-voice-controller";
import { ColyseusVoiceAdapter } from "@/voice/adapters/ColyseusVoiceAdapter";

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

export default function TableScreen() {
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{ id: string; buyInCents?: string }>();
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
    dispatchAddBot,
    dispatchRemoveBot,
    joinState,
    lobbyTables,
    snapshotsByTableId,
    chatMessagesByTableId,
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

  const handleDeleteTable = useCallback(() => {
    confirmDeleteTable(tableId, {
      onSuccess: () => {
        closeTable(tableId);
        storeRegistry.table().clearTable(tableId);
        storeRegistry.lobby().refresh();
        router.replace(lobbyPath());
      },
    });
  }, [tableId, closeTable, router]);

  const handleCloseTableAndReturn = useCallback(() => {
    if (id) {
      closeTable(String(id));
      storeRegistry.table().clearTable(String(id));
    }
    router.replace(lobbyPath());
  }, [id, closeTable, router]);

  const [playerPopup, setPlayerPopup] = useState<{ name: string } | null>(null);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [voiceRoom, setVoiceRoom] = useState<any | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voicePrefReady, setVoicePrefReady] = useState(false);
  const outOfChipsNoticeShownForHandIdRef = useRef<string | null>(null);
  const chatOverlayRef = useRef<{ setVisible: (v: boolean) => void } | null>(null);
  const voiceControllerRef = useRef<ReturnType<typeof createVoiceController> | null>(null);
  const autoJoinAttemptedRef = useRef(false);

  const snapshot = snapshotsByTableId[tableId];
  const snapshotSeats = snapshot?.seats;
  const tableStatus = tableStatusByTableId[tableId] ?? "DISCONNECTED";
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

  const handleSendChat = useCallback(
    (text: string) => dispatchSendChat({ tableId, text }),
    [tableId, dispatchSendChat]
  );
  const chatOverlay = useChatOverlay(tableId, chatMessagesForOverlay, { onSend: handleSendChat });
  chatOverlayRef.current = chatOverlay;

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

  const { addBotPending, handleAddBot } = useAddBot({
    tableId,
    buyInCents,
    dispatchAddBot,
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

  useEffect(() => {
    if (tableId && lobbyTables.length === 0) {
      storeRegistry.lobby().refresh();
    }
  }, [tableId, lobbyTables.length]);

  useEffect(() => {
    if (!tableId) return;
    const hasOpenTable = openTableIds.includes(tableId);
    const shouldPersistRouteBuyIn =
      Number.isInteger(routeBuyInCents) &&
      Number(routeBuyInCents) > 0 &&
      routeBuyInCents !== joinState?.buyInCents;

    if (!hasOpenTable) {
      openTable(tableId, shouldPersistRouteBuyIn ? { buyInCents: routeBuyInCents } : undefined);
    } else if (shouldPersistRouteBuyIn) {
      openTable(tableId, { buyInCents: routeBuyInCents });
    }

    if (activeTableId !== tableId) setActive(tableId);
  }, [tableId, routeBuyInCents, joinState?.buyInCents, openTableIds, activeTableId, openTable, setActive]);

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
    [openTableIds, snapshotsByTableId]
  );

  // Dropdown: switch table and close the dropdown.
  const handleSelectTable = useCallback(
    (targetId: string) => {
      setActive(targetId);
      router.push(tablePath(targetId));
      setActiveTablesDropdownVisible(false);
    },
    [setActive, router]
  );

  // Tabs: switch table only; dropdown is not open.
  const handleSelectTab = useCallback(
    (targetId: string) => {
      setActive(targetId);
      router.push(tablePath(targetId));
    },
    [setActive, router]
  );

  const realtimeRoomId = useMemo(() => {
    if (persistedRoomId && persistedRoomId.length > 0) return persistedRoomId;
    const byTableId = normalizedLobbyTables.find((t) => t.tableId === tableId || t.id === tableId);
    if (byTableId?.roomId && byTableId.roomId.length > 0) return byTableId.roomId;
    return tableId;
  }, [persistedRoomId, normalizedLobbyTables, tableId]);

  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const shouldConnectRealtime = authHydrated && Boolean(authToken) && Boolean(tableId);
  const tableNextPath = useMemo(
    () => tablePath(tableId, routeBuyInCents ? { buyInCents: routeBuyInCents } : undefined),
    [tableId, routeBuyInCents],
  );

  useEffect(() => {
    if (!authHydrated) return;
    if (authToken) return;
    router.replace(loginPathWithNext(tableNextPath));
  }, [authHydrated, authToken, router, tableNextPath]);

  const handleRealtimeError = useCallback((message: string) => {
    console.log("TABLE_REALTIME_ERROR", message);
  }, []);

  const handleTableGone = useCallback(() => {
    useToastStore.getState().show(TABLE.tableGone, "danger");
    closeTable(tableId);
    storeRegistry.table().clearTable(tableId);
    router.replace(lobbyPath());
  }, [tableId, closeTable, router]);

  useTableRealtime({
    tableId,
    roomId: realtimeRoomId,
    buyInCents,
    enabled: shouldConnectRealtime,
    onError: handleRealtimeError,
    onTableGone: handleTableGone,
    onReadyRoom: setVoiceRoom,
  });

  useEffect(() => {
    if (!voiceRoom || !heroUserId) return;
    const adapter = new ColyseusVoiceAdapter(voiceRoom);
    const controller = createVoiceController({
      adapter,
      selfId: heroUserId,
      channelId: tableId,
    });
    voiceControllerRef.current = controller;
    autoJoinAttemptedRef.current = false;

    return () => {
      const current = voiceControllerRef.current;
      voiceControllerRef.current = null;
      autoJoinAttemptedRef.current = false;
      if (current) void current.leave();
    };
  }, [voiceRoom, heroUserId, tableId]);

  useEffect(() => {
    if (!snapshotSeats || !heroUserId || !voiceControllerRef.current) return;
    const peerIds = snapshotSeats
      .filter((seat) => seat.occupied && !seat.isBot && seat.connected && seat.userId && seat.userId !== heroUserId)
      .map((seat) => String(seat.userId))
      .sort();
    voiceControllerRef.current.setPeers(peerIds);
  }, [snapshotSeats, heroUserId]);

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

  useEffect(() => {
    const controller = voiceControllerRef.current;
    if (!voiceEnabled || !voicePrefReady) {
      autoJoinAttemptedRef.current = false;
      return;
    }
    if (heroIsSittingOut) return;
    if (!controller) return;
    if (controller.isEnabled()) {
      controller.setMuted(voiceMuted);
      return;
    }
    if (autoJoinAttemptedRef.current) return;

    autoJoinAttemptedRef.current = true;
    void controller
      .join()
      .then(() => {
        controller.setMuted(voiceMuted);
      })
      .catch((err) => {
        console.log("VOICE_AUTOJOIN_ERROR", err);
        setVoiceEnabled(false);
        showVoiceError(err);
      });
  }, [voiceEnabled, voiceMuted, voicePrefReady, voiceRoom, heroUserId, heroIsSittingOut, showVoiceError]);

  useEffect(() => {
    if (!heroIsSittingOut) return;
    const controller = voiceControllerRef.current;
    if (!controller || !controller.isEnabled()) return;
    void controller.leave().finally(() => {
      setVoiceEnabled(false);
      setVoiceMuted(false);
      autoJoinAttemptedRef.current = false;
    });
  }, [heroIsSittingOut]);

  const handleToggleVoice = useCallback(() => {
    const controller = voiceControllerRef.current;
    if (!controller) return;
    void controller
      .toggleEnabled()
      .then((enabled) => {
        setVoiceEnabled(enabled);
        if (enabled) {
          controller.setMuted(voiceMuted);
        } else {
          autoJoinAttemptedRef.current = false;
        }
      })
      .catch((err) => {
        console.log("VOICE_TOGGLE_ERROR", err);
        showVoiceError(err);
      });
  }, [voiceMuted, showVoiceError]);

  const handleToggleMute = useCallback(() => {
    const controller = voiceControllerRef.current;
    if (!controller || !voiceEnabled) return;
    const muted = controller.toggleMute();
    setVoiceMuted(muted);
  }, [voiceEnabled]);

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
    [tableId, dispatchTableAction]
  );

  const handlePlayerPress = useCallback(
    (o: Opponent) => {
      if (o.isBot) {
        dispatchRemoveBot({ tableId, botId: o.id });
      } else {
        setPlayerPopup({ name: o.name });
      }
    },
    [dispatchRemoveBot, tableId],
  );

  const setChatVisibleTrue = useCallback(() => chatOverlayRef.current?.setVisible(true), []);

  const tableTopBarRight = useMemo(
    () => (
      <View className="ui-row ui-inline-1">
        {tableTopBarFlags.showAddBot ? (
          <Button minWidth={160} variant="link" title="+ Bot" onPress={handleAddBot} loading={addBotPending} />
        ) : null}
        <IconButton
          variant="link"
          icon={<Icon name="theme" size={20} />}
          onPress={() => setThemePickerVisible(true)}
        />
        <IconButton variant="link" icon={<Icon name="chat" />} onPress={setChatVisibleTrue} badge={chatOverlay.unseenCount || undefined} />
        <Button variant="link" title={voiceEnabled ? "Stop Voice" : "Join Voice"} onPress={handleToggleVoice} />
        <View style={{
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
          <Button variant="link" title={voiceMuted ? "🔇" : "🔈"} onPress={handleToggleMute} />
          <Button variant="link" title="X" onPress={handleCloseTableAndReturn} />
        </>
      </View>
    ),
    [
      tableTopBarFlags.showDelete,
      tableTopBarFlags.showAddBot,
      handleDeleteTable,
      handleAddBot,
      addBotPending,
      setChatVisibleTrue,
      chatOverlay.unseenCount,
      voiceEnabled,
      voiceMuted,
      handleToggleVoice,
      handleToggleMute,
      handleCloseTableAndReturn,
    ]
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

  return (
    <Screen>
      {(openTableIds?.length ?? 0) > 1 && (
        <View className="ui-p-stack-2">
          <MultiTableTabs
            openTableIds={openTableIds}
            activeTableId={activeTableId}
            onSelectTable={handleSelectTab}
            onOpenMoreTables={() => setActiveTablesDropdownVisible(true)}
          />
        </View>
      )}
      {sceneMode === "auth_loading" ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Restoring session..." onPress={() => { }} />
        </View>
      ) : sceneMode === "auth_required" ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Session required. Redirecting to login..." onPress={() => router.replace(loginPathWithNext(tableNextPath))} />
        </View>
      ) : sceneMode === "connecting" ? (
        <View className="flex-1">
          <TableTopBar
            userName={profile.username}
            balanceCents={balanceCents}
            right={
              <View className="ui-row ui-inline-1">
                <Button variant="link" title="X" onPress={handleCloseTableAndReturn} />
              </View>
            }
          />
          <ConnectingTableShell
            message={
              !hasValidBuyIn
                ? "Missing buy-in data."
                : tableError
                  ? tableError
                  : tableStatus === "DISCONNECTED"
                    ? "Connecting..."
                    : tableStatus === "RECONNECTING"
                      ? "Reconnecting to table..."
                      : `Connecting to table (${tableStatus})...`
            }
            action={
              <Button variant="link" title="Return to lobby" onPress={() => router.replace(lobbyPath())} />
            }
          />
        </View>
      ) : sceneMode === "idle" ? (
        <EmptyTableView
          snapshot={snapshot!}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          handResultMessage={handResultMessage ?? undefined}
          topBarRight={tableTopBarRight}
          onPlayerPress={handlePlayerPress}
          canRebuy={canRebuy}
          onPressRebuy={() => setRebuySheetVisible(true)}
        />
      ) : sceneMode === "active" ? (
        <TableLayout
          snapshot={snapshot!}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          connectionStatus={tableStatus}
          actionMessage={actionMessage ?? undefined}
          handResultMessage={handResultMessage ?? undefined}
          topBarRight={tableTopBarRight}
          onAction={sendAction}
          onPlayerPress={handlePlayerPress}
          canRebuy={canRebuy}
          onPressRebuy={() => setRebuySheetVisible(true)}
        />
      ) : null}
      <ChatOverlay
        visible={chatOverlay.visible}
        onClose={chatOverlay.onClose}
        messages={chatOverlay.messages}
        onSend={chatOverlay.onSend}
      />
      {playerPopup && (
        <PlayerHistoryPopup
          visible
          onClose={() => setPlayerPopup(null)}
          name={playerPopup.name}
        />
      )}
      {rebuySheetVisible &&
        snapshot?.table?.minBuyInCents != null &&
        snapshot?.table?.maxBuyInCents != null ? (
        <ChooseTableModal
          visible
          onClose={() => setRebuySheetVisible(false)}
          title={MODAL.rebuy}
          balanceCents={balanceCents}
          minBuyInCents={snapshot.table.minBuyInCents}
          maxBuyInCents={Math.min(snapshot.table.maxBuyInCents, balanceCents)}
          onApply={(opts) => {
            void handleRebuyApply(opts.buyInCents);
            setRebuySheetVisible(false);
          }}
        />
      ) : null}
      <ActiveTablesDropdown
        visible={activeTablesDropdownVisible}
        onClose={() => setActiveTablesDropdownVisible(false)}
        tables={activeTableRows}
        onSelectTable={handleSelectTable}
      />
      <ThemePickerSheet visible={themePickerVisible} onClose={() => setThemePickerVisible(false)} />
      <BottomBar active="table" />
    </Screen>
  );
}
