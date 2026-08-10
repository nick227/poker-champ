import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { LobbyTabKey } from "@/features/lobby";
import type { LobbySortDir } from "@/features/lobby/components/lobby/LobbyTableList";
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
  const [activeTab, setActiveTab] = useState<LobbyTabKey>("cash");
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
      setActiveTab("cash");
    },
    dismissLessonNudge: () => setFromLessonDismissed(true),
    activeTab,
    setActiveTab,
    joinedTournamentsCount,
    createModeLabel:
      activeTab === "tournaments" ? "Create tournament" : "New cash table",
    onModeCreate:
      activeTab === "tournaments"
        ? tournament.handleCreateTournament
        : cash.openCreateTable,
    openCreateTable: cash.openCreateTable,
    instantStartInFlightPreset: cash.instantStartInFlightPreset,
    handleStartInstantGame: cash.handleStartInstantGame,
    filters,
    updateFilters,
    clearFilters,
    sortedTables,
    busy,
    error,
    sortKey,
    sortDir,
    handleSort,
    isJoining: cash.isJoining,
    openJoinModal: cash.openJoinModal,
    refresh,
    tournamentList,
    tournamentsBusy,
    tournamentsError,
    refreshTournaments,
    openOnlineSheet,
    requestOnlinePlayers,
    createModalVisible: cash.createModalVisible,
    setCreateModalVisible: cash.setCreateModalVisible,
    handleCreateGame: cash.handleCreateGame,
    chooseTableModal: cash.chooseTableModal,
    setChooseTableModal: cash.setChooseTableModal,
    handleJoinApply: cash.handleJoinApply,
    onlineSheetVisible,
    setOnlineSheetVisible,
    router,
    ...tournament,
  };
}
