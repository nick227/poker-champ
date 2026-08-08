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
import { playSound } from "@/lib/sound";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { SoundEvent } from "@/sound/emitSoundEvent";
import { MODAL } from "@/constants/copy";
import { useResolvedBuyIn } from "@/features/table";
import { useTableScene } from "@/features/table";
import { useTableDisplayEvents } from "@/features/table";
import { useChatOverlay } from "@/components/domain/chat/useChatOverlay";
import { useRebuySheet } from "@/features/table";
import { useAddBot } from "@/features/table";
import { useVoiceControllerLifecycle } from "@/features/table";
import { useVoiceJoinPolicy } from "@/features/table";
import { showVoiceErrorToast } from "@/voice/errors";
import { useOpenTableSync } from "@/features/table";
import { useTableConnection } from "@/features/table";
import { useTableLoadPhase } from "@/features/table/components/table/hooks/useTableLoadPhase";
import { isRecoverableTableJoinFailure } from "@/lib/tableJoinFailure";
import {
  loadPhaseStatusMessage,
  logTableLoadEvent,
  MAX_TABLE_AUTO_RECOVERY_ATTEMPTS,
} from "@/lib/tableLoadPhase";
import { resolveCashTableResumeOutcome } from "@/lib/cashTableRecovery";
import { postCashTableResume } from "@/services/post/tables.resume";
import { resolveTournamentTableForJoin } from "@/lib/tournamentEnsureJoin";
import { usePlayerJoinedSound } from "@/features/table";
import { useTablePageStores } from "@/features/table/hooks/useTablePageStores";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TablePageController } from "@/types/tableSceneContract";
import type { RejoinUiState } from "@/features/table";
import { isRejoinErrorMessage, mapRejoinErrorMessage, resolveTableGoneForRejoin } from "@/features/table-page/rejoin.helpers";
import { TABLE_ANIMATION_REQUEST_VERSION } from "@/features/table/animations/animationTypes";
import type { TableAnimationRequest, AnchorBounds, Rect } from "@/features/table/animations/animationTypes";
import { mapPotWinTier, mapAllInTier } from "@/features/table/animations/animationMapper";
import {
  clearAllPendingTimeouts,
  computePotWinDispatchDelayMs,
  resolveShowdownAnimationDecision,
  scheduleSurvivingTimeout,
} from "@/features/table/animations/animationTriggers";
import { getOccupiedHumanCount, resolveDisplayEventsForRender } from "./displayEventsPolicy";

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
    pendingActionForTable,
    lobbyTables,
    snapshotsByTableId,
    chatMessagesForTable,
    botSummariesForTable,
    botSummariesUpdatedAtForTable,
    connectionStatusForTable,
    errorForTable,
    loadSignalsForTable,
    lastSeqForTable,
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
  const [tournamentStandingsVisible, setTournamentStandingsVisible] = useState(false);
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
  const lastShowdownHandIdRef = useRef<string | null>(null);
  // Pending POT_WIN dispatches delayed to sequence after a SHOWDOWN reveal (see effect below).
  // Tracked outside any single effect's cleanup so a *new* hand's snapshot update (which changes
  // this effect's deps) can't cancel a still-pending celebration for the *previous* hand — only
  // true unmount clears these (separate effect further down).
  const pendingPotWinTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const autoJoinAttemptedRef = useRef(false);
  const pendingRemoveBotIdRef = useRef<string | null>(null);
  const hasObservedActiveHandRef = useRef(false);
  const prevOccupiedHumanCountRef = useRef<number | null>(null);
  const hiddenWinnerHandIdRef = useRef<string | null>(null);

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

  const translatedDisplayEvents = useTableDisplayEvents(tableId, snapshot);
  usePlayerJoinedSound(snapshot);

  const occupiedHumanCount = useMemo(
    () => getOccupiedHumanCount(snapshot),
    [snapshot],
  );

  useEffect(() => {
    hasObservedActiveHandRef.current = false;
    prevOccupiedHumanCountRef.current = null;
    hiddenWinnerHandIdRef.current = null;
  }, [tableId]);

  useEffect(() => {
    if (snapshot?.hand?.handId) {
      hasObservedActiveHandRef.current = true;
      hiddenWinnerHandIdRef.current = null;
    }
  }, [snapshot?.hand?.handId]);

  const displayEvents = useMemo(
    () =>
      resolveDisplayEventsForRender({
        translatedEvents: translatedDisplayEvents,
        snapshot,
        hasObservedActiveHand: hasObservedActiveHandRef.current,
        previousOccupiedHumanCount: prevOccupiedHumanCountRef.current,
        hiddenWinnerHandId: hiddenWinnerHandIdRef.current,
      }),
    [snapshot, translatedDisplayEvents],
  );

  useEffect(() => {
    const previousOccupiedHumanCount = prevOccupiedHumanCountRef.current;
    const humansLeftAndNoHand =
      previousOccupiedHumanCount != null &&
      occupiedHumanCount < previousOccupiedHumanCount &&
      !snapshot?.hand;

    if (humansLeftAndNoHand && snapshot?.lastHandResult?.handId) {
      hiddenWinnerHandIdRef.current = snapshot.lastHandResult.handId;
    }

    prevOccupiedHumanCountRef.current = occupiedHumanCount;
  }, [occupiedHumanCount, snapshot?.hand, snapshot?.lastHandResult?.handId]);

  const heroName = seatContext?.heroSeat?.name;
  const winnerBanner = displayEvents.winnerBanner;
  const isHeroWinner = !!winnerBanner && winnerBanner.winnerName === heroName;

  // SHOWDOWN reveal: hero-only (fires only when hero actually reached showdown, i.e. didn't
  // fold before the reveal), whether hero wins or loses. Runs on the same TABLE fx channel as
  // POT_WIN, so it must dispatch (and dedupe by handId) independently and *before* POT_WIN's
  // own dispatch for the same hand — see the delay in the POT_WIN effect below.
  useEffect(() => {
    const decision = resolveShowdownAnimationDecision(snapshot, lastShowdownHandIdRef.current);
    if (!decision) return;
    lastShowdownHandIdRef.current = decision.handId;
    setAnimationRequest(decision.request);
  }, [snapshot]);

  useEffect(() => {
    if (!winnerBanner || !snapshot?.lastHandResult || !isHeroWinner) return;
    const handId = snapshot.lastHandResult.handId;
    if (lastPotWinHandIdRef.current === handId) return;
    lastPotWinHandIdRef.current = handId;
    const potCents = snapshot.lastHandResult.potCents ?? 0;
    const winnerSeat = snapshot.hero?.seat;
    const tier = mapPotWinTier({
      potCents,
      winningHandDescr: winnerBanner.winningHandDescr,
    });
    const dispatch = () => {
      setAnimationRequest({
        version: TABLE_ANIMATION_REQUEST_VERSION,
        event: "POT_WIN",
        tier,
        payload: {
          headline: "YOU WIN",
          amountCents: winnerBanner.amountCents,
          potCents,
          isHero: true,
          winnerSeat,
        },
      });
    };
    // Hand went to showdown: the reveal fires on the same TABLE fx channel (see effect above).
    // Delay pot-win so it lands after the showdown reveal fully finishes, instead of racing it
    // for the shared channel (both are keyed off the same snapshot.lastHandResult change).
    // scheduleSurvivingTimeout intentionally does not tie this to the effect's own cleanup — see
    // its doc comment for why that would silently drop the celebration when the next hand starts.
    const delayMs = computePotWinDispatchDelayMs(
      snapshot.lastHandResult.reason,
      potCents,
      winnerBanner.winningHandDescr
    );
    if (delayMs > 0) {
      scheduleSurvivingTimeout(pendingPotWinTimeoutsRef.current, delayMs, dispatch);
      return;
    }
    dispatch();
  }, [winnerBanner, snapshot?.lastHandResult, isHeroWinner, snapshot?.hero?.seat]);

  // True-unmount-only cleanup for any still-pending delayed POT_WIN dispatches (see above).
  useEffect(() => {
    const pending = pendingPotWinTimeoutsRef.current;
    return () => clearAllPendingTimeouts(pending);
  }, []);

  useEffect(() => {
    const lastAction = snapshot?.lastAction;
    if (lastAction?.action !== "ALL_IN") return;
    if (lastAction.actorUserId !== snapshot?.hero?.userId) return;
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
        isHero: true,
        anchorSeat: snapshot?.hero?.seat,
      },
    });
  }, [snapshot?.lastAction, snapshot?.hero?.userId, snapshot?.hero?.seat, snapshot?.hand?.potCents, snapshot?.lastHandResult?.potCents]);

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

  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [loadRecoveryBusy, setLoadRecoveryBusy] = useState(false);
  const autoRecoveryAttemptedRef = useRef(false);
  const cashRecoveryLoggedRef = useRef(false);

  const tournamentId =
    joinState?.tournamentId ?? snapshot?.table?.tournament?.tournamentId ?? undefined;

  const loadSignals = useMemo(
    () => ({
      welcomeAt: loadSignalsForTable?.welcomeAt,
      sessionRestoreAt: loadSignalsForTable?.sessionRestoreAt,
      snapshotAt: loadSignalsForTable?.lastSnapshotAt,
    }),
    [loadSignalsForTable],
  );

  const loadPhaseState = useTableLoadPhase({
    tableId,
    authHydrated,
    hasAuthToken: Boolean(authToken),
    hasSnapshot: Boolean(snapshot),
    snapshotSeq: snapshot?.snapshotSeq ?? lastSeqForTable,
    connectionStatus,
    loadSignals,
    tableError,
  });

  const loadStatusMessage = useMemo(
    () => loadPhaseStatusMessage(loadPhaseState.phase, loadPhaseState.timedOut),
    [loadPhaseState.phase, loadPhaseState.timedOut],
  );

  const recoverRoomIdHint = useMemo(() => {
    if (persistedRoomId && persistedRoomId.length > 0) return persistedRoomId;
    const row = tableById.get(tableId);
    if (row?.roomId && row.roomId.length > 0) return row.roomId;
    return tableId;
  }, [persistedRoomId, tableById, tableId]);

  const clearTableLoadFailureState = useCallback(() => {
    storeRegistry.table().resetSnapshotStream(tableId);
    storeRegistry.table().clearTableLoadSignals(tableId);
    loadPhaseState.resetForRetry();
    autoRecoveryAttemptedRef.current = false;
    cashRecoveryLoggedRef.current = false;
  }, [tableId, loadPhaseState.resetForRetry]);

  const { sceneMode, tableTopBarFlags } = useTableScene({
    authHydrated,
    hasAuthToken: Boolean(authToken),
    hasSnapshot: Boolean(snapshot),
    hasActiveHand: Boolean(snapshot?.hand),
    canAddBot: Boolean(snapshot?.hero.youAreSeated && buyInCents && !snapshot?.table?.tournament),
    showLoadRecovery: loadPhaseState.showRecovery,
  });

  const applyResumeReconnect = useCallback(
    (roomId: string, oldRoomId: string | null | undefined, buyInCentsOverride?: number) => {
      if (oldRoomId && oldRoomId !== roomId) {
        logTableLoadEvent("stale_roomid_replaced", {
          tableId,
          oldRoomId,
          newRoomId: roomId,
          phase: loadPhaseState.phase,
        });
      }
      storeRegistry.tables().setRoomForTable(tableId, roomId);
      if (Number.isInteger(buyInCentsOverride) && Number(buyInCentsOverride) > 0) {
        storeRegistry.tables().setLastBuyIn(tableId, Number(buyInCentsOverride));
      }
      storeRegistry.table().resetSnapshotStream(tableId);
      storeRegistry.table().clearTableLoadSignals(tableId);
      loadPhaseState.resetForRetry();
      setReconnectNonce((n) => n + 1);
    },
    [tableId, loadPhaseState.phase, loadPhaseState.resetForRetry],
  );

  const runTournamentEnsureRecover = useCallback(async (): Promise<boolean> => {
    if (!tournamentId) return false;
    const oldRoomId = storeRegistry.tables().roomIdByTableId[tableId];
    logTableLoadEvent("table_recovery_attempt", {
      tableId,
      tournamentId,
      oldRoomId: oldRoomId ?? null,
      phase: loadPhaseState.phase,
    });
    const resolved = await resolveTournamentTableForJoin(tournamentId);
    if (!resolved.ok) {
      loadPhaseState.markFailed(resolved.message);
      storeRegistry.table().setError(tableId, resolved.message);
      return false;
    }
    applyResumeReconnect(resolved.roomId, oldRoomId);
    storeRegistry.lobby().refresh();
    logTableLoadEvent("table_recovery_success", {
      tableId,
      newRoomId: resolved.roomId,
      tournamentId,
    });
    return true;
  }, [
    tableId,
    tournamentId,
    loadPhaseState.phase,
    loadPhaseState.markFailed,
    applyResumeReconnect,
  ]);

  const runCashTableResumeRecover = useCallback(async (): Promise<boolean> => {
    const oldRoomId = storeRegistry.tables().roomIdByTableId[tableId] ?? recoverRoomIdHint;
    logTableLoadEvent("table_recovery_attempt", {
      tableId,
      oldRoomId,
      phase: loadPhaseState.phase,
      source: "cash_resume",
    });
    try {
      const result = await postCashTableResume(tableId, { roomId: recoverRoomIdHint });
      const outcome = resolveCashTableResumeOutcome(result, buyInCents);
      if (outcome.kind === "reconnect") {
        applyResumeReconnect(outcome.roomId, oldRoomId, outcome.buyInCents);
        logTableLoadEvent("cash_table_recovery_success", {
          tableId,
          oldRoomId,
          newRoomId: outcome.roomId,
          resumeStatus: result.resumeStatus,
          connectionStatus,
        });
        return true;
      }
      loadPhaseState.markFailed(outcome.message);
      storeRegistry.table().setError(tableId, outcome.message);
      return false;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not resume this table";
      loadPhaseState.markFailed(message);
      storeRegistry.table().setError(tableId, message);
      logTableLoadEvent("table_recovery_failed", {
        tableId,
        message,
        source: "cash_resume",
      });
      return false;
    }
  }, [
    tableId,
    recoverRoomIdHint,
    buyInCents,
    loadPhaseState.phase,
    loadPhaseState.markFailed,
    applyResumeReconnect,
    connectionStatus,
  ]);

  const retryTableLoad = useCallback(() => {
    clearTableLoadFailureState();
    setReconnectNonce((n) => n + 1);
  }, [clearTableLoadFailureState]);

  const recoverTableLoad = useCallback(() => {
    if (loadRecoveryBusy) return;
    setLoadRecoveryBusy(true);
    loadPhaseState.beginRecovering();
    void (async () => {
      try {
        const ok = tournamentId
          ? await runTournamentEnsureRecover()
          : await runCashTableResumeRecover();
        if (!ok) return;
      } finally {
        setLoadRecoveryBusy(false);
      }
    })();
  }, [
    loadRecoveryBusy,
    loadPhaseState.beginRecovering,
    tournamentId,
    runTournamentEnsureRecover,
    runCashTableResumeRecover,
  ]);

  const goToLobby = useCallback(() => {
    clearTableLoadFailureState();
    setLoadRecoveryBusy(false);
    router.replace(lobbyPath());
  }, [clearTableLoadFailureState, router]);

  const handleTerminalJoinFailure = useCallback(
    (failedTableId: string, message: string) => {
      if (failedTableId !== tableId) return;
      if (!isRecoverableTableJoinFailure(message)) return;

      if (!tournamentId) {
        if (cashRecoveryLoggedRef.current) return;
        cashRecoveryLoggedRef.current = true;
        logTableLoadEvent("cash_table_recovery_unavailable", {
          tableId,
          message,
          connectionStatus,
          realtimeRoomId: persistedRoomId ?? tableId,
          reason: "no_tournament_ensure_table",
          autoRecovery: false,
        });
        return;
      }

      if (autoRecoveryAttemptedRef.current) return;
      if (loadPhaseState.recoveryAttemptCount >= MAX_TABLE_AUTO_RECOVERY_ATTEMPTS) return;
      autoRecoveryAttemptedRef.current = true;
      setLoadRecoveryBusy(true);
      loadPhaseState.beginRecovering();
      void runTournamentEnsureRecover().finally(() => setLoadRecoveryBusy(false));
    },
    [
      tableId,
      tournamentId,
      persistedRoomId,
      connectionStatus,
      loadPhaseState.recoveryAttemptCount,
      loadPhaseState.beginRecovering,
      runTournamentEnsureRecover,
    ],
  );

  useEffect(() => {
    if (snapshot) {
      loadPhaseState.markReady();
      autoRecoveryAttemptedRef.current = false;
      cashRecoveryLoggedRef.current = false;
    }
  }, [snapshot?.snapshotId, snapshot?.snapshotSeq, loadPhaseState.markReady]);

  useEffect(() => {
    autoRecoveryAttemptedRef.current = false;
    cashRecoveryLoggedRef.current = false;
    storeRegistry.table().clearTableLoadSignals(tableId);
  }, [tableId]);

  const { hasValidBuyIn, realtimeRoomId } = useTableConnection({
    tableId,
    persistedRoomId,
    tableById,
    buyInCents,
    authHydrated,
    hasAuthToken: Boolean(authToken),
    reconnectNonce,
    onError: handleRealtimeError,
    onTableGone: handleTableGone,
    onTerminalJoinFailure: handleTerminalJoinFailure,
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
        if (__DEV__) {
          console.warn("TABLE_ACTION_DISPATCH_BLOCKED_DIAG", {
            tableId,
            action,
            amountCents: payload.amount ?? null,
            snapshotId: snapshot?.snapshotId ?? null,
            handId: snapshot?.hand?.handId ?? null,
            street: snapshot?.hand?.street ?? null,
            toActSeat: snapshot?.hand?.toActSeat ?? null,
            heroSeat: snapshot?.hero?.seat ?? null,
            connectionStatus,
            hasHeroActionOptions: !!snapshot?.hero?.actionOptions,
          });
        }
      }
      return ok;
    },
    [tableId, dispatchTableAction, snapshot, connectionStatus],
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
        pendingRemoveBotIdRef.current = o.id;
        dispatchRemoveBot({ tableId, botId: o.id });
      } else {
        setPlayerPopup({ name: o.name });
      }
    },
    [dispatchRemoveBot, tableId],
  );

  useEffect(() => {
    const pending = pendingRemoveBotIdRef.current;
    if (pending == null) return;
    const stillPresent = opponents.some(({ id }) => id === pending);
    if (stillPresent) return;
    pendingRemoveBotIdRef.current = null;
    playSound("donk");
  }, [opponents]);

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
      loadPhase: loadPhaseState.phase,
      showLoadRecovery: loadPhaseState.showRecovery,
      loadStatusMessage,
      loadRecoveryBusy,
      canRecoverTable: true,
      realtimeRoomId,
      tableNextPath,
      hasValidBuyIn,
      tableStatus,
      connectionStatus,
      tableError,
      loadDevDiagnostics: __DEV__
        ? `phase=${loadPhaseState.phase} room=${realtimeRoomId} conn=${connectionStatus} seq=${snapshot?.snapshotSeq ?? lastSeqForTable ?? "—"} attempts=${loadPhaseState.recoveryAttemptCount}`
        : undefined,
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
      displayEvents,
      pendingAction: pendingActionForTable,
      canRebuy,
      tableTopBarRight,
      activeTableRows,
      chatMessages: chatOverlay.messages,
      chatVisible: chatOverlay.visible,
      botSummaries: botSummariesForTable,
      rejoinUiState,
      rejoinErrorMessage,
      animationRequest,
      tournamentStandingsVisible,
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
      goToLobby,
      retryTableLoad,
      recoverTableLoad,
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
      openTournamentStandings: useCallback(() => setTournamentStandingsVisible(true), []),
      closeTournamentStandings: useCallback(() => setTournamentStandingsVisible(false), []),
    },
  };
}

