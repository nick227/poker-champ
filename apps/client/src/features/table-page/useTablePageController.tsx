import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { TableTopNavMenu } from "@/features/table";
import { buildSeatContext, getHeroDisplayStatus, mapSeatsToOpponents } from "@/features/table";
import type { Opponent, ConnectionStatus } from "@/features/table";
import type { TableAction } from "@/features/table";
import { storeRegistry } from "@/registry/store.registry";
import type { TableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useToastStore } from "@/stores/toast.store";
import { lobbyPath, loginPathWithNext, tablePath } from "@/lib/nav";
import { normalizeTable } from "@/lib/lobbyTables";
import { loadVoicePreference, saveVoicePreference } from "@/lib/voicePreferenceStorage";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { SoundEvent } from "@/sound/emitSoundEvent";
import { MODAL } from "@/constants/copy";
import { useResolvedBuyIn } from "@/features/table";
import { useTableScene } from "@/features/table";
import { useActionMessages } from "@/features/table";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";
import { useRebuySheet } from "@/features/table";
import { useAddBot } from "@/features/table";
import { useVoiceControllerLifecycle } from "@/features/table";
import { useVoiceJoinPolicy } from "@/features/table";
import { showVoiceErrorToast } from "@/voice/errors";
import { useOpenTableSync } from "@/features/table";
import { useTableConnection } from "@/features/table";
import { usePlayerJoinedSound } from "@/features/table";
import { useTablePageStores } from "@/features/table/hooks/useTablePageStores";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TablePageController } from "@/types/tableSceneContract";
import type { RejoinUiState } from "@/features/table";
import { isRejoinErrorMessage, mapRejoinErrorMessage, resolveTableGoneForRejoin } from "@/features/table-page/rejoin.helpers";
import { TABLE_ANIMATION_REQUEST_VERSION } from "@/features/table/animations/animationTypes";
import type { TableAnimationRequest, AnchorBounds, Rect } from "@/features/table/animations/animationTypes";
import { mapPotWinTier, mapAllInTier } from "@/features/table/animations/animationMapper";

function rectEqual(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function anchorBoundsEqual(a: AnchorBounds, b: AnchorBounds): boolean {
  if (!rectEqual(a.board, b.board)) return false;
  if (!rectEqual(a.hero, b.hero)) return false;
  const aSeat = a.seatByIndex ?? {};
  const bSeat = b.seatByIndex ?? {};
  const seatKeys = new Set([...Object.keys(aSeat), ...Object.keys(bSeat)]);
  for (const k of seatKeys) {
    const i = Number(k);
    if (!rectEqual(aSeat[i], bSeat[i])) return false;
  }
  const aSlots = a.cardSlots ?? [];
  const bSlots = b.cardSlots ?? [];
  const len = Math.max(aSlots.length, bSlots.length);
  for (let i = 0; i < len; i++) {
    if (!rectEqual(aSlots[i], bSlots[i])) return false;
  }
  return true;
}

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

const TABLE_ACTION_TO_SOUND_EVENT: Record<TableAction, SoundEvent> = {
  FOLD: "table.action.fold",
  CHECK: "table.action.check",
  CALL: "table.action.call",
  BET: "table.action.bet",
  RAISE: "table.action.raise",
  ALL_IN: "table.action.allIn",
};
const MAX_CHAT_OVERLAY_MESSAGES = 100;

type UseTablePageControllerParams = {
  id?: string;
  buyInCentsParam?: string;
};

export function useTablePageController({
  id,
  buyInCentsParam,
}: UseTablePageControllerParams): TablePageController {
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
    dispatchRejoin,
    dispatchJoinTable,
    dispatchAddBot,
    dispatchRemoveBot,
    dispatchSetSittingOut,
    joinState,
    lobbyTables,
    snapshotsByTableId,
    chatMessagesForTable,
    botSummariesForTable,
    botSummariesUpdatedAtForTable,
    connectionStatusForTable,
    errorForTable,
    hydrated: authHydrated,
    token: authToken,
  } = useTablePageStores(tableId);

  const normalizedLobbyTables = useMemo(
    () => lobbyTables.map((t: unknown) => normalizeTable(t as Record<string, unknown>)) as LobbyTableRow[],
    [lobbyTables],
  );
  const tableById = useMemo(() => {
    const map = new Map<string, LobbyTableRow>();
    for (const table of normalizedLobbyTables) {
      map.set(table.id, table);
      map.set(table.tableId, table);
    }
    return map;
  }, [normalizedLobbyTables]);

  const { buyInCents, routeBuyInCents } = useResolvedBuyIn({
    tableId,
    buyInCentsParam,
    joinStateBuyInCents: joinState?.buyInCents,
    persistedBuyInCents,
    tableById,
  });

  const { cents: balanceCents, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();

  const [playerPopup, setPlayerPopup] = useState<{ name: string } | null>(null);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [voiceRoom, setVoiceRoom] = useState<TableRealtimeRoom | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voicePrefReady, setVoicePrefReady] = useState(false);
  const [rejoinUiState, setRejoinUiState] = useState<RejoinUiState>("idle");
  const [rejoinErrorMessage, setRejoinErrorMessage] = useState<string | null>(null);
  const [animationRequest, setAnimationRequest] = useState<TableAnimationRequest | null>(null);
  const [anchorBounds, setAnchorBounds] = useState<AnchorBounds>({});
  const anchorPendingRef = useRef<Partial<AnchorBounds>>({});
  const anchorRafRef = useRef<number | null>(null);
  const flushAnchorBounds = useCallback(() => {
    if (anchorRafRef.current != null) return;
    anchorRafRef.current = requestAnimationFrame(() => {
      anchorRafRef.current = null;
      const p = anchorPendingRef.current;
      anchorPendingRef.current = {};
      if (Object.keys(p).length === 0) return;
      setAnchorBounds((prev) => {
        const next: AnchorBounds = { ...prev };
        if (p.board != null) next.board = p.board;
        if (p.hero != null) next.hero = p.hero;
        if (p.seatByIndex != null) next.seatByIndex = { ...prev.seatByIndex, ...p.seatByIndex };
        if (p.cardSlots != null) {
          const arr = [...(prev.cardSlots ?? [])];
          p.cardSlots.forEach((r, i) => {
            if (r != null) arr[i] = r;
          });
          next.cardSlots = arr.length ? arr : prev.cardSlots;
        }
        if (anchorBoundsEqual(prev, next)) return prev;
        return next;
      });
    });
  }, []);
  const outOfChipsNoticeShownForHandIdRef = useRef<string | null>(null);
  const lastPotWinHandIdRef = useRef<string | null>(null);
  const lastAllInKeyRef = useRef<string | null>(null);
  const autoJoinAttemptedRef = useRef(false);

  const closeTableAndReturn = useCallback(() => {
    // Hard leave: explicit user intent to leave seat/table lifecycle.
    try {
      if (typeof voiceRoom?.disconnect === "function") {
        voiceRoom.disconnect(true);
      } else if (typeof voiceRoom?.leave === "function") {
        void voiceRoom.leave(true);
      }
    } catch (err) {
      console.warn("TABLE_HARD_LEAVE_FAILED", err);
    }
    if (id) {
      closeTable(String(id));
      storeRegistry.table().clearTable(String(id));
    }
    router.replace(lobbyPath());
  }, [id, closeTable, router, voiceRoom]);

  const snapshot = snapshotsByTableId[tableId];
  const snapshotSeats = snapshot?.seats;
  const tableStatus = connectionStatusForTable ?? "DISCONNECTED";
  const connectionStatus = tableStatus as ConnectionStatus;
  const tableError = errorForTable;
  const opponents = useMemo(() => (snapshot ? mapSeatsToOpponents(snapshot) : []), [snapshot]);
  const seatContext = useMemo(
    () => (snapshot ? buildSeatContext(snapshot) : undefined),
    [snapshot],
  );
  const heroUserId = snapshot?.hero?.userId;
  const chatMessagesForOverlay = useMemo(() => {
    const list =
      chatMessagesForTable.length > MAX_CHAT_OVERLAY_MESSAGES
        ? chatMessagesForTable.slice(-MAX_CHAT_OVERLAY_MESSAGES)
        : chatMessagesForTable;
    return list.map((m: { id: string; senderName: string; text: string; senderUserId: string }) => ({
      id: m.id,
      sender: m.senderName,
      text: m.text,
      isSelf: heroUserId != null && m.senderUserId === heroUserId,
    }));
  }, [chatMessagesForTable, heroUserId]);

  const sendChat = useCallback(
    (text: string) => dispatchSendChat({ tableId, text }),
    [tableId, dispatchSendChat],
  );
  const chatOverlay = useChatOverlay({
    scopeKey: `table:${tableId}`,
    messages: chatMessagesForOverlay,
    onSend: sendChat,
  });

  const { actionMessage, handResultMessage } = useActionMessages(tableId, snapshot);
  usePlayerJoinedSound(snapshot);

  const heroName = seatContext?.heroSeat?.name;
  const isHeroWinner = !!handResultMessage && handResultMessage.winnerName === heroName;

  useEffect(() => {
    if (!handResultMessage || !snapshot?.lastHandResult) return;
    const handId = snapshot.lastHandResult.handId;
    if (lastPotWinHandIdRef.current === handId) return;
    lastPotWinHandIdRef.current = handId;
    const potCents = snapshot.lastHandResult.potCents ?? 0;
    const tier = mapPotWinTier({
      potCents,
      winningHandDescr: handResultMessage.winningHandDescr,
    });
    setAnimationRequest({
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "POT_WIN",
      tier,
      payload: {
        headline: isHeroWinner ? "YOU WIN" : `${handResultMessage.winnerName} wins`,
        amountCents: handResultMessage.amountCents,
        potCents,
      },
    });
  }, [handResultMessage, snapshot?.lastHandResult, isHeroWinner]);

  useEffect(() => {
    const lastAction = snapshot?.lastAction;
    if (lastAction?.action !== "ALL_IN") return;
    const key = `${lastAction.handId}:${lastAction.seq}`;
    if (lastAllInKeyRef.current === key) return;
    lastAllInKeyRef.current = key;
    const potCents = snapshot?.hand?.potCents ?? snapshot?.lastHandResult?.potCents ?? 0;
    const tier = mapAllInTier({ potCents, amountCents: lastAction.amountCents });
    setAnimationRequest({
      version: TABLE_ANIMATION_REQUEST_VERSION,
      event: "ALL_IN",
      tier,
      payload: {
        headline: "ALL IN",
        amountCents: lastAction.amountCents,
        potCents,
      },
    });
  }, [snapshot?.lastAction, snapshot?.hand?.potCents, snapshot?.lastHandResult?.potCents]);

  const { sceneMode, tableTopBarFlags } = useTableScene({
    authHydrated,
    hasAuthToken: Boolean(authToken),
    hasSnapshot: Boolean(snapshot),
    hasActiveHand: Boolean(snapshot?.hand),
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
    botSummaries: botSummariesForTable,
    botSummariesUpdatedAtTs: botSummariesUpdatedAtForTable,
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
      openTableIds.map((oid: string) => {
        const s = snapshotsByTableId[oid];
        let heroSeatForTable: TableSnapshotPayload["seats"][number] | undefined;
        if (s?.hero.seat != null) {
          for (const seat of s.seats) {
            if (seat.seat === s.hero.seat) {
              heroSeatForTable = seat;
              break;
            }
          }
        }
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
    const resolution = resolveTableGoneForRejoin(rejoinUiState);
    if (!resolution.shouldCloseTable) {
      if (resolution.nextRejoinUiState) setRejoinUiState(resolution.nextRejoinUiState);
      if (resolution.rejoinErrorMessage) setRejoinErrorMessage(mapRejoinErrorMessage(resolution.rejoinErrorMessage));
      return;
    }
    useToastStore.getState().show("Table no longer exists", "danger");
    closeTable(tableId);
    storeRegistry.table().clearTable(tableId);
    router.replace(lobbyPath());
  }, [rejoinUiState, closeTable, tableId, router]);

  const handleReadyRoom = useCallback((room: TableRealtimeRoom | null) => {
    setVoiceRoom((prev) => (prev === room ? prev : room));
  }, []);

  const { hasValidBuyIn } = useTableConnection({
    tableId,
    persistedRoomId,
    tableById,
    buyInCents,
    authHydrated,
    hasAuthToken: Boolean(authToken),
    onError: handleRealtimeError,
    onTableGone: handleTableGone,
    onReadyRoom: handleReadyRoom,
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

  const heroSeat = seatContext?.heroSeat;
  const heroStackCents = heroSeat?.stackCents ?? -1;
  const heroStatus = heroSeat?.status ?? "";
  const heroDisplayStatus = useMemo(
    () => (snapshot ? getHeroDisplayStatus(snapshot, seatContext) : "SITTING_OUT"),
    [snapshot, seatContext],
  );
  const heroIsSittingOut = heroDisplayStatus === "SITTING_OUT";

  const { handleToggleVoice } = useVoiceJoinPolicy({
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
    showVoiceError: showVoiceErrorToast,
  });

  const sendAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
      const soundEvent = TABLE_ACTION_TO_SOUND_EVENT[payload.type];
      const ok = dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (ok) {
        emitSoundEvent(soundEvent);
      } else {
        console.log("TABLE_ACTION_FALLBACK", { action, tableId, reason: "sender-not-registered-or-invalid-payload" });
      }
    },
    [tableId, dispatchTableAction],
  );

  const toggleHeroSittingOut = useCallback(() => {
    const targetSittingOut = !heroIsSittingOut;
    const ok = dispatchSetSittingOut({ tableId, sittingOut: targetSittingOut });
    if (!ok) {
      console.log("TABLE_SIT_OUT_TOGGLE_FALLBACK", {
        tableId,
        targetSittingOut,
        reason: "sender-not-registered-or-invalid-payload",
      });
    }
  }, [dispatchSetSittingOut, heroIsSittingOut, tableId]);

  const rejoinHero = useCallback(() => {
    if (rejoinUiState === "sending") return;
    setRejoinUiState("sending");
    setRejoinErrorMessage(null);
    const ok = dispatchRejoin({ tableId });
    if (!ok) {
      setRejoinUiState("error");
      setRejoinErrorMessage("Connection unavailable");
    }
  }, [dispatchRejoin, rejoinUiState, tableId]);

  const joinTableFromFallback = useCallback(() => {
    if (!Number.isInteger(buyInCents) || Number(buyInCents) <= 0) {
      setRejoinUiState("error");
      setRejoinErrorMessage("Could not rejoin table. Please retry.");
      return;
    }
    setRejoinUiState("sending");
    setRejoinErrorMessage(null);
    const ok = dispatchJoinTable({ tableId, buyInCents: Number(buyInCents) });
    if (!ok) {
      setRejoinUiState("error");
      setRejoinErrorMessage("Connection unavailable");
    }
  }, [buyInCents, dispatchJoinTable, tableId]);

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
      <TableTopNavMenu
        chatBadge={chatOverlay.unseenCount || undefined}
        voiceEnabled={voiceEnabled}
        onOpenTheme={() => setThemePickerVisible(true)}
        onToggleVoice={handleToggleVoice}
        onOpenChat={openChat}
        onAddBot={handleAddBotPress}
        onLeaveTable={closeTableAndReturn}
        addBotDisabled={!tableTopBarFlags.showAddBot || addBotPending}
      />
    ),
    [
      chatOverlay.unseenCount,
      voiceEnabled,
      handleToggleVoice,
      openChat,
      handleAddBotPress,
      closeTableAndReturn,
      tableTopBarFlags.showAddBot,
      addBotPending,
    ],
  );

  const activeOrLastHandId = snapshot?.hand?.handId ?? snapshot?.lastHandResult?.handId ?? null;
  const outOfChipsHandId = useMemo(() => {
    if (!snapshot?.hero.youAreSeated || activeOrLastHandId == null) return null;
    if (heroStackCents > 0 || (heroStatus !== "OUT" && heroStatus !== "ABANDONED")) return null;
    return activeOrLastHandId;
  }, [snapshot, heroStackCents, heroStatus, activeOrLastHandId]);

  useEffect(() => {
    if (outOfChipsHandId == null) return;
    if (outOfChipsNoticeShownForHandIdRef.current === outOfChipsHandId) return;
    outOfChipsNoticeShownForHandIdRef.current = outOfChipsHandId;
    useToastStore.getState().show("You are out of chips and sitting out. Add chips to continue.", "danger");
  }, [outOfChipsHandId]);

  useEffect(() => {
    if (rejoinUiState !== "sending") return;
    if (heroIsSittingOut) return;
    setRejoinUiState("idle");
    setRejoinErrorMessage(null);
  }, [heroIsSittingOut, rejoinUiState]);

  useEffect(() => {
    if (rejoinUiState !== "sending") return;
    if (!tableError) return;
    if (!isRejoinErrorMessage(tableError)) return;
    setRejoinUiState("error");
    setRejoinErrorMessage(mapRejoinErrorMessage(tableError));
  }, [rejoinUiState, tableError]);

  useEffect(() => {
    if (rejoinUiState !== "sending") return;
    if (connectionStatus === "CONNECTED") return;
    setRejoinUiState("error");
    setRejoinErrorMessage(connectionStatus === "RECONNECTING" ? "Connection interrupted" : "Connection lost");
  }, [connectionStatus, rejoinUiState]);

  useEffect(() => {
    if (!tableError) return;
    if (isRejoinErrorMessage(tableError)) {
      return;
    }
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
      tableId,
      openTableIds,
      activeTableId,
      profileUsername: profile.username,
      currentUserAvatarUrl: profile.avatarUrl ?? undefined,
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
      botSummaries: botSummariesForTable,
      rejoinUiState,
      rejoinErrorMessage,
      animationRequest,
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
      openAddBotPicker: handleAddBotPress,
      pickBot: handleBotPick,
      sendAction,
      toggleHeroSittingOut,
      rejoinHero,
      joinTableFromFallback,
      closeChat: chatOverlay.onClose,
      sendChat: chatOverlay.onSend,
      requestTableAnimation: setAnimationRequest,
      clearAnimationRequest: () => setAnimationRequest(null),
      reportBoardBounds: useCallback(
        (rect: Rect) => {
          anchorPendingRef.current.board = rect;
          flushAnchorBounds();
        },
        [flushAnchorBounds]
      ),
      reportHeroBounds: useCallback(
        (rect: Rect) => {
          anchorPendingRef.current.hero = rect;
          flushAnchorBounds();
        },
        [flushAnchorBounds]
      ),
      reportSeatBounds: useCallback(
        (seatIndex: number, rect: Rect) => {
          const cur = anchorPendingRef.current.seatByIndex ?? {};
          anchorPendingRef.current.seatByIndex = { ...cur, [seatIndex]: rect };
          flushAnchorBounds();
        },
        [flushAnchorBounds]
      ),
      reportCardSlotBounds: useCallback(
        (index: number, rect: Rect) => {
          const prev = anchorPendingRef.current.cardSlots ?? [];
          anchorPendingRef.current.cardSlots = Array.from({ length: 5 }, (_, i) => (i === index ? rect : prev[i]));
          flushAnchorBounds();
        },
        [flushAnchorBounds]
      ),
    },
  };
}

