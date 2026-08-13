import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { LobbySortDir } from "@/features/lobby/components/lobby/LobbyTableList";
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
import { useBankroll } from "@/hooks/useBankroll";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { useProfile } from "@/hooks/useProfile";
import { normalizeTable, type LobbyTableRow } from "@/lib/lobbyTables";
import { tablePath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useAuthStore } from "@/stores/auth.store";
import { useToastStore } from "@/stores/toast.store";

export function useLobbyScreenModel() {
  const router = useRouter();
  const authToken = useAuthStore((s) => s.token);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const authenticated = authHydrated && Boolean(authToken);
  const { fromLesson } = useLocalSearchParams<{ fromLesson?: string }>();
  const [fromLessonDismissed, setFromLessonDismissed] = useState(false);
  const showFromLessonNudge = Boolean(fromLesson && !fromLessonDismissed);

  const { tables, refresh, busy, error } = storeRegistry.use.lobby();
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
    const browse = excludePinnedLobbyTables(lobbyTableRows, pinnedCashIds);
    const cmp = LOBBY_SORT_COMPARATORS[sortKey];
    const sorted = [...browse].sort(cmp);
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [lobbyTableRows, pinnedCashIds, sortKey, sortDir]);

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

  return {
    authenticated,
    profile,
    bankroll,
    isDesktopWorkspace,
    showFromLessonNudge,
    playFromLesson: () => {
      setFromLessonDismissed(true);
      router.push("/lobby/cash");
    },
    dismissLessonNudge: () => setFromLessonDismissed(true),
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
    sortedTables,
    pinnedCashTables,
    resumeCashTable,
    tournaments: tournamentList,
    busy,
    error,
    sortKey,
    sortDir,
    handleSort,
    isJoining,
    openJoinModal,
    refresh,
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
