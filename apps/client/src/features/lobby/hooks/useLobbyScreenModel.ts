import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { LobbyContentMode } from "@/features/lobby/lobbyContentMode";
import type { LobbySortDir } from "@/features/lobby/components/lobby/LobbyTableList";
import { filterTournamentsByQuery } from "@/features/lobby/components/lobby/LobbyTournamentPrimary";
import { useLobbyCashActions } from "@/features/lobby/hooks/useLobbyCashActions";
import { useLobbyScreenEffects } from "@/features/lobby/hooks/useLobbyScreenEffects";
import { useLobbyTournamentActions } from "@/features/lobby/hooks/useLobbyTournamentActions";
import { useLobbyRealtimeBridge } from "@/features/lobby/realtime/lobbyRealtimeBridge";
import {
  LOBBY_SORT_COMPARATORS,
  type LobbySortKey,
} from "@/features/lobby/lobbyTableSort";
import {
  applyLobbyFilters,
  DEFAULT_LOBBY_FILTERS,
  loadLobbyFilters,
  saveLobbyFilters,
  type LobbyTableFilters,
} from "@/features/lobby/lobbyTableFilters";
import { useBankroll } from "@/hooks/useBankroll";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { useProfile } from "@/hooks/useProfile";
import { normalizeTable } from "@/lib/lobbyTables";
import { selectJoinedTournaments } from "@/lib/tournament.utils";
import { storeRegistry } from "@/registry/store.registry";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useAuthStore } from "@/stores/auth.store";
import { useToastStore } from "@/stores/toast.store";

/** Composes lobby data, cash actions, and tournament actions for the screen. */
export function useLobbyScreenModel() {
  const router = useRouter();
  const authToken = useAuthStore((s) => s.token);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const authenticated = authHydrated && Boolean(authToken);
  const { fromLesson } = useLocalSearchParams<{ fromLesson?: string }>();
  const [fromLessonDismissed, setFromLessonDismissed] = useState(false);
  const showFromLessonNudge = Boolean(fromLesson && !fromLessonDismissed);

  const {
    tables,
    refresh,
    busy,
    error,
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
  } = storeRegistry.use.lobby();
  const {
    tournaments: tournamentList,
    busy: tournamentsBusy,
    error: tournamentsError,
    refresh: refreshTournaments,
  } = storeRegistry.use.tournaments();
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const setRoomForTable = storeRegistry.use.tables((s) => s.setRoomForTable);
  const setTableName = storeRegistry.use.tables((s) => s.setTableName);
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const { cents: bankroll, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const isDesktopWorkspace = useIsDesktopWorkspace();

  const [sortKey, setSortKey] = useState<LobbySortKey>("name");
  const [sortDir, setSortDir] = useState<LobbySortDir>("asc");
  const [filters, setFilters] = useState<LobbyTableFilters>(() => loadLobbyFilters());
  const [contentMode, setContentMode] = useState<LobbyContentMode>("all");
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const cash = useLobbyCashActions({
    authToken,
    bankroll,
    openTable,
    setRoomForTable,
    setTableName,
    refresh,
  });
  const tournament = useLobbyTournamentActions({
    authenticated,
    openTable,
    setRoomForTable,
    refreshTournaments,
    refreshBankroll,
    tournamentList,
    authToken,
  });

  const onTournamentCancelled = useCallback(
    (t: TournamentSummary) => {
      showToast(
        `${t.name} was cancelled (not enough players or table could not start). Entry refunded.`,
        "danger",
      );
    },
    [showToast],
  );

  useLobbyScreenEffects({
    authHydrated,
    authToken,
    refresh,
    refreshTournaments,
    tournamentList,
    isDesktopWorkspace,
    onTournamentCancelled,
  });

  const sortedTables = useMemo(() => {
    const rows = tables.map((t: unknown) => normalizeTable(t as Record<string, unknown>));
    const filtered = applyLobbyFilters(rows, filters);
    const cmp = LOBBY_SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort(cmp);
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [tables, sortKey, sortDir, filters]);

  const filteredTournaments = useMemo(
    () => filterTournamentsByQuery(tournamentList, filters.query),
    [tournamentList, filters.query],
  );

  const handleSort = useCallback((key: LobbySortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "name" ? "asc" : "desc");
      return key;
    });
  }, []);

  const updateFilters = useCallback((next: LobbyTableFilters) => {
    setFilters(next);
    saveLobbyFilters(next);
  }, []);

  const clearFilters = useCallback(() => updateFilters(DEFAULT_LOBBY_FILTERS), [updateFilters]);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const joinedTournamentsCount = useMemo(
    () => selectJoinedTournaments(tournamentList).length,
    [tournamentList],
  );

  const {
    openCreateTable,
    handleCreateGame,
    handleStartInstantGame,
    openJoinModal,
    handleJoinApply,
    isJoining,
    createModalVisible,
    setCreateModalVisible,
    chooseTableModal,
    setChooseTableModal,
    instantStartInFlightPreset,
  } = cash;

  const {
    handleCreateTournament,
    handleDeleteTournament,
    handleOpenTournamentDetail,
    handleTournamentAction,
    handleConfirmTournamentJoin,
    handleConfirmTournamentRegister,
    registerModalTournament,
    setRegisterModalTournament,
    joinModalTournament,
    setJoinModalTournament,
    registerBusy,
    standingsModal,
    setStandingsModal,
    tournamentActionBusy,
    tournamentCreateModalVisible,
    setTournamentCreateModalVisible,
    tournamentDeleteId,
  } = tournament;

  const handleNew = useCallback(() => {
    if (contentMode === "tournaments") {
      handleCreateTournament();
      return;
    }
    openCreateTable();
  }, [contentMode, handleCreateTournament, openCreateTable]);

  const resultLabel = useMemo(() => {
    const tablesLabel = `${sortedTables.length} ${sortedTables.length === 1 ? "table" : "tables"}`;
    const eventsLabel = `${filteredTournaments.length} ${
      filteredTournaments.length === 1 ? "event" : "events"
    }`;
    if (contentMode === "cash") return tablesLabel;
    if (contentMode === "tournaments") return eventsLabel;
    return `${tablesLabel} · ${eventsLabel}`;
  }, [contentMode, filteredTournaments.length, sortedTables.length]);

  return {
    authenticated,
    profile,
    bankroll,
    isDesktopWorkspace,
    onlineLabel: onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`,
    onlinePlayers,
    onlineBusy,
    onlineError,
    showFromLessonNudge,
    playFromLesson: () => {
      setFromLessonDismissed(true);
      setContentMode("cash");
    },
    dismissLessonNudge: () => setFromLessonDismissed(true),
    contentMode,
    setContentMode,
    joinedTournamentsCount,
    handleNew,
    openCreateTable,
    handleCreateTournament,
    handleDeleteTournament,
    handleOpenTournamentDetail,
    handleTournamentAction,
    handleConfirmTournamentJoin,
    handleConfirmTournamentRegister,
    registerModalTournament,
    setRegisterModalTournament,
    joinModalTournament,
    setJoinModalTournament,
    registerBusy,
    standingsModal,
    setStandingsModal,
    tournamentActionBusy,
    tournamentCreateModalVisible,
    setTournamentCreateModalVisible,
    tournamentDeleteId,
    instantStartInFlightPreset,
    handleStartInstantGame,
    filters,
    updateFilters,
    clearFilters,
    sortedTables,
    filteredTournaments,
    resultLabel,
    showCash: contentMode === "all" || contentMode === "cash",
    showTournaments: contentMode === "all" || contentMode === "tournaments",
    busy,
    error,
    sortKey,
    sortDir,
    handleSort,
    isJoining,
    openJoinModal,
    refresh,
    tournamentList,
    tournamentsBusy,
    tournamentsError,
    refreshTournaments,
    openOnlineSheet,
    requestOnlinePlayers,
    createModalVisible,
    setCreateModalVisible,
    handleCreateGame,
    chooseTableModal,
    setChooseTableModal,
    handleJoinApply,
    onlineSheetVisible,
    setOnlineSheetVisible,
    router,
  };
}
