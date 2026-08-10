import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { LobbyContentMode } from "@/features/lobby/lobbyContentMode";
import type { LobbySortDir } from "@/features/lobby/components/lobby/LobbyTableList";
import { filterTournamentsByQuery } from "@/features/lobby/components/lobby/LobbyTournamentPrimary";
import { useLobbyCashActions } from "@/features/lobby/hooks/useLobbyCashActions";
import { useLobbyScreenEffects } from "@/features/lobby/hooks/useLobbyScreenEffects";
import { useLobbyTournamentActions } from "@/features/lobby/hooks/useLobbyTournamentActions";
import {
  buildPinnedCashLobbyRows,
  excludePinnedLobbyTables,
} from "@/features/lobby/lobbySessionTables";
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
import { normalizeTable, type LobbyTableRow } from "@/lib/lobbyTables";
import { tablePath } from "@/lib/nav";
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
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const tableNameByTableId = storeRegistry.use.tables((s) => s.tableNameByTableId);
  const lastBuyInCentsByTableId = storeRegistry.use.tables((s) => s.lastBuyInCentsByTableId);
  const roomIdByTableId = storeRegistry.use.tables((s) => s.roomIdByTableId);
  const tableJoinById = storeRegistry.use.tables((s) => s.tableJoinById);
  const { cents: bankroll, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const isDesktopWorkspace = useIsDesktopWorkspace();

  const [sortKey, setSortKey] = useState<LobbySortKey>("name");
  const [sortDir, setSortDir] = useState<LobbySortDir>("asc");
  const [filters, setFilters] = useState<LobbyTableFilters>(() => loadLobbyFilters());
  const [contentMode, setContentMode] = useState<LobbyContentMode>("all");

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

  const lobbyTableRows = useMemo(
    () => tables.map((t: unknown) => normalizeTable(t as Record<string, unknown>)),
    [tables],
  );

  const tournamentTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tournamentList) {
      if (t.tableId) ids.add(t.tableId);
    }
    for (const [id, join] of Object.entries(tableJoinById)) {
      if (join?.tournamentId) ids.add(id);
    }
    return ids;
  }, [tableJoinById, tournamentList]);

  const pinnedCashTables = useMemo(
    () =>
      buildPinnedCashLobbyRows({
        openTableIds,
        lobbyTables: lobbyTableRows,
        tournamentTableIds,
        tableNameByTableId,
        lastBuyInCentsByTableId,
        roomIdByTableId,
      }),
    [
      openTableIds,
      lobbyTableRows,
      tournamentTableIds,
      tableNameByTableId,
      lastBuyInCentsByTableId,
      roomIdByTableId,
    ],
  );

  const pinnedCashIds = useMemo(
    () => new Set(pinnedCashTables.map((row) => row.id)),
    [pinnedCashTables],
  );

  const sortedTables = useMemo(() => {
    const filtered = applyLobbyFilters(
      excludePinnedLobbyTables(lobbyTableRows, pinnedCashIds),
      filters,
    );
    const cmp = LOBBY_SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort(cmp);
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [lobbyTableRows, pinnedCashIds, sortKey, sortDir, filters]);

  const filteredTournaments = useMemo(
    () => filterTournamentsByQuery(tournamentList, filters.query),
    [tournamentList, filters.query],
  );

  const resumeCashTable = useCallback(
    (table: LobbyTableRow) => {
      router.push(tablePath(table.id, { buyInCents: lastBuyInCentsByTableId[table.id] }));
    },
    [lastBuyInCentsByTableId, router],
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
    const cashCount = sortedTables.length + pinnedCashTables.length;
    const tablesLabel = `${cashCount} ${cashCount === 1 ? "table" : "tables"}`;
    const eventsLabel = `${filteredTournaments.length} ${
      filteredTournaments.length === 1 ? "event" : "events"
    }`;
    if (contentMode === "cash") return tablesLabel;
    if (contentMode === "tournaments") return eventsLabel;
    return `${tablesLabel} · ${eventsLabel}`;
  }, [contentMode, filteredTournaments.length, pinnedCashTables.length, sortedTables.length]);

  return {
    authenticated,
    profile,
    bankroll,
    isDesktopWorkspace,
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
    pinnedCashTables,
    resumeCashTable,
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
    createModalVisible,
    setCreateModalVisible,
    handleCreateGame,
    chooseTableModal,
    setChooseTableModal,
    handleJoinApply,
    router,
  };
}
