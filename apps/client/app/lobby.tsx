import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/features/lobby";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { GameListHeader } from "@/features/lobby";
import { InstantGamePanels } from "@/features/lobby";
import { ReplayQuickLinks } from "@/features/lobby";
import { JoinedTournamentsSection, TournamentsSection } from "@/features/lobby";
import { TournamentCreateModal, TournamentJoinModal, TournamentRegisterModal, TournamentStandingsModal } from "@/features/lobby";
import { GameTablePanel } from "@/features/lobby";
import { GameTablePanelSkeleton } from "@/features/lobby";
import { EmptyState } from "@/features/lobby";
import { LobbyTabs, type LobbyTabKey } from "@/features/lobby";
import { OnlinePlayersSheet } from "@/features/lobby";
import { CreateGameModal } from "@/features/lobby";
import { ChooseTableModal } from "@/features/lobby";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/features/lobby/realtime/lobbyRealtimeBridge";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useJoiningTableState } from "@/hooks/useJoiningTableState";
import { postCreateInstantGame, postCreateTable } from "@/services/post/lobby.post";
import { useToastStore } from "@/stores/toast.store";
import { normalizeTable } from "@/lib/lobbyTables";
import { confirmDeleteTable } from "@/lib/deleteTable";
import { loginPathWithNext, tablePath } from "@/lib/nav";
import { useLatestReplayHand } from "@/hooks/useLatestReplayHand";
import { useTournamentStartLobbyEffects } from "@/features/lobby/hooks/useTournamentStartLobbyEffects";
import { getDefaultCommunityHand } from "@/features/replay/community/communityHands";
import { useAuthStore } from "@/stores/auth.store";
import { serviceRegistry } from "@/registry/service.registry";
import { mapTournamentApiError, selectJoinedTournaments } from "@/lib/tournament.utils";
import {
  buildInstantCreateTableConfig,
  getInstantGamePreset,
  type InstantGamePresetId,
} from "@/features/lobby";
import {
  confirmTournamentRegister,
  executeTournamentTableJoin,
  dispatchTournamentCta,
} from "@/lib/tournament.actions";
import { tournamentPath } from "@/lib/nav";
import type { TournamentSummary } from "@/services/tournaments.types";

type SortKey = "name" | "players" | "blinds";

const SORT_COMPARATORS: Record<SortKey, (a: ReturnType<typeof normalizeTable>, b: ReturnType<typeof normalizeTable>) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  players: (a, b) => b.players - a.players,
  blinds: (a, b) => (a.blinds ?? "").localeCompare(b.blinds ?? ""),
};

const SORT_CYCLE: Record<SortKey, SortKey> = { name: "players", players: "blinds", blinds: "name" };

export default function LobbyScreen() {
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
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const { cents: bankroll, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [activeTab, setActiveTab] = useState<LobbyTabKey>("cash");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [instantStartInFlightPreset, setInstantStartInFlightPreset] = useState<InstantGamePresetId | null>(null);
  const [chooseTableModal, setChooseTableModal] = useState<{
    id: string;
    roomId?: string;
    minBuyInCents: number;
    maxBuyInCents: number;
  } | null>(null);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const [registerModalTournament, setRegisterModalTournament] = useState<TournamentSummary | null>(null);
  const [joinModalTournament, setJoinModalTournament] = useState<TournamentSummary | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [standingsModal, setStandingsModal] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [tournamentActionBusy, setTournamentActionBusy] = useState(false);
  const [tournamentCreateModalVisible, setTournamentCreateModalVisible] = useState(false);
  const [tournamentDeleteId, setTournamentDeleteId] = useState<string | null>(null);
  const { beginJoining, clearJoining, isJoining } = useJoiningTableState();
  const {
    latestHandId,
    loading: latestReplayLoading,
    error: latestReplayError,
  } = useLatestReplayHand();

  useEffect(() => {
    if (!authHydrated) return;
    void refresh();
    void refreshTournaments();
  }, [authHydrated, refresh, refreshTournaments]);

  useEffect(() => {
    if (!authHydrated) return;
    void refreshTournaments();
  }, [authHydrated, authToken, refreshTournaments]);

  useEffect(() => {
    if (!authHydrated) return;
    const timer = setInterval(() => {
      void refresh({ background: true });
      void refreshTournaments({ background: true });
    }, 30_000);
    return () => clearInterval(timer);
  }, [authHydrated, refresh, refreshTournaments]);

  const handleTournamentAutoCancelled = useCallback(
    (tournament: TournamentSummary) => {
      showToast(
        `${tournament.name} was cancelled (not enough players or table could not start). Entry refunded.`,
        "danger",
      );
    },
    [showToast],
  );

  useTournamentStartLobbyEffects({
    tournaments: tournamentList,
    enabled: authHydrated,
    refreshTournaments,
    onTournamentCancelled: handleTournamentAutoCancelled,
  });

  const sortedTables = useMemo(() => {
    const rows = tables.map((t: unknown) => normalizeTable(t as Record<string, unknown>));
    return [...rows].sort(SORT_COMPARATORS[sortKey]);
  }, [tables, sortKey]);

  const cycleSort = useCallback(() => setSortKey((k) => SORT_CYCLE[k]), []);

  const joinedTournamentsCount = useMemo(
    () => selectJoinedTournaments(tournamentList).length,
    [tournamentList],
  );

  const handleCreateGame = async (config: Parameters<typeof postCreateTable>[0]) => {
    if (!authToken) {
      router.push(loginPathWithNext("/lobby"));
      return;
    }
    try {
      await postCreateTable(config);
      refresh();
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Failed to create game", "danger");
    }
  };

  const handleStartInstantGame = useCallback(async (presetId: InstantGamePresetId) => {
    if (!authToken) {
      router.push(loginPathWithNext("/lobby"));
      return;
    }
    if (instantStartInFlightPreset) return;

    const createConfig = buildInstantCreateTableConfig(presetId);
    const preset = getInstantGamePreset(presetId);
    if (bankroll < createConfig.minBuyInCents) {
      useToastStore
        .getState()
        .show("Insufficient bankroll for instant game. Deposit or choose a lower-stakes table.", "danger");
      return;
    }

    setInstantStartInFlightPreset(presetId);
    const unlockTimer = setTimeout(() => setInstantStartInFlightPreset(null), 15000);

    try {
      const created = await postCreateInstantGame({
        presetId,
        config: createConfig,
        targetBotCount: preset.targetBotCount,
      });
      const tableId = String((created as { tableId?: string })?.tableId ?? "");
      if (!tableId) throw new Error("Failed to create instant game");
      const createdRoomId = typeof (created as { roomId?: string }).roomId === "string"
        ? (created as { roomId: string }).roomId
        : "";
      if (createdRoomId) setRoomForTable(tableId, createdRoomId);
      openTable(tableId, { buyInCents: createConfig.minBuyInCents });
      router.push(
        tablePath(tableId, {
          buyInCents: createConfig.minBuyInCents,
        }),
      );
      refresh();
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Failed to start instant game", "danger");
    } finally {
      clearTimeout(unlockTimer);
      setInstantStartInFlightPreset(null);
    }
  }, [authToken, bankroll, instantStartInFlightPreset, openTable, refresh, router, setRoomForTable]);

  const handleJoinApply = useCallback((opts: { buyInCents: number }) => {
    if (!chooseTableModal) return;
    const targetTableId = chooseTableModal.id;
    beginJoining(targetTableId);

    try {
      if (chooseTableModal.roomId) setRoomForTable(targetTableId, chooseTableModal.roomId);
      openTable(targetTableId, { buyInCents: opts.buyInCents });
      router.push(tablePath(targetTableId, { buyInCents: opts.buyInCents }));
      setChooseTableModal(null);
      clearJoining(targetTableId);
    } catch (e) {
      clearJoining(targetTableId);
      useToastStore.getState().show((e as Error).message ?? "Failed to join table", "danger");
    }
  }, [beginJoining, chooseTableModal, clearJoining, openTable, router, setRoomForTable]);

  const skeletonCount = 3;

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

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const handleCreateTournament = useCallback(() => {
    if (!authToken) {
      router.push(loginPathWithNext("/lobby"));
      return;
    }
    setTournamentCreateModalVisible(true);
  }, [authToken, router]);

  const handleDeleteTournament = useCallback(
    async (tournament: TournamentSummary) => {
      setTournamentDeleteId(tournament.id);
      const res = await serviceRegistry.post.tournamentCancel(tournament.id);
      if (!res.ok) {
        showToast(mapTournamentApiError(res.error.message || "Delete failed", res.error.code), "danger");
        setTournamentDeleteId(null);
        return;
      }
      showToast("Tournament deleted", "success");
      void refreshTournaments();
      setTournamentDeleteId(null);
    },
    [refreshTournaments, showToast],
  );

  const handleOpenTournamentDetail = useCallback(
    (tournament: TournamentSummary) => {
      router.push(tournamentPath(tournament.id));
    },
    [router],
  );

  const handleTournamentAction = useCallback(
    (tournament: TournamentSummary) => {
      dispatchTournamentCta(tournament, {
        router,
        authenticated,
        actionInFlight: tournamentActionBusy || registerBusy,
        setActionInFlight: setTournamentActionBusy,
        showToast,
        onRequestRegister: setRegisterModalTournament,
        onRequestJoin: setJoinModalTournament,
        onRequestStandings: (t) =>
          setStandingsModal({ id: t.id, name: t.name, status: t.status }),
        openTable,
        setRoomForTable,
        refreshTournament: () => { void refreshTournaments(); },
        refreshBankroll: () => { void refreshBankroll(); },
        loginReturnPath: "/lobby",
        lookupTournament: (id) => tournamentList.find((t) => t.id === id),
        joinSource: "lobby_cta",
      });
    },
    [
      authenticated,
      openTable,
      refreshBankroll,
      refreshTournaments,
      registerBusy,
      router,
      setRoomForTable,
      showToast,
      tournamentActionBusy,
      tournamentList,
    ],
  );

  const handleConfirmTournamentJoin = useCallback(() => {
    if (!joinModalTournament) return;
    setTournamentActionBusy(true);
    void executeTournamentTableJoin(
      joinModalTournament,
      {
        openTable,
        router,
        setRoomForTable,
        showToast,
        refreshTournament: () => { void refreshTournaments(); },
      },
      {
        source: "join_modal",
        clickedSnapshot: joinModalTournament,
      },
    )
      .then((ok) => {
        if (ok) setJoinModalTournament(null);
      })
      .finally(() => setTournamentActionBusy(false));
  }, [joinModalTournament, openTable, refreshTournaments, router, setRoomForTable, showToast]);

  const handleConfirmTournamentRegister = useCallback(async () => {
    if (!registerModalTournament) return;
    setRegisterBusy(true);
    const ok = await confirmTournamentRegister(
      registerModalTournament.id,
      {
        showToast,
        refreshTournament: () => { void refreshTournaments(); },
        refreshBankroll: () => { void refreshBankroll(); },
      },
      "lobby_register_modal",
    );
    if (ok) setRegisterModalTournament(null);
    setRegisterBusy(false);
  }, [registerModalTournament, refreshBankroll, refreshTournaments, showToast]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  return (
    <Screen>
      <HeaderStack>
        <Masthead />
        <AppTopNav
          username={profile.username ?? "Player"}
          onlineLabel={onlineLabel}
          onPressOnline={openOnlineSheet}
          amountCents={bankroll}
          avatarUrl={profile.avatarUrl}
        />
      </HeaderStack>
      {showFromLessonNudge ? (
        <View className="mx-4 mt-2 flex-row items-center justify-between rounded-xl border border-brand/30 bg-brand/10 px-3 py-2">
          <Text variant="body" className="text-foreground flex-1 text-sm">
            Very nice!
          </Text>
          <Button
            title="Dismiss"
            onPress={() => setFromLessonDismissed(true)}
            intent="neutral"
            size="sm"
            className="min-h-[30px] px-2 py-1"
            textClassName="text-muted"
          />
        </View>
      ) : null}
      <ScrollView className="flex-1">
        <ReplayQuickLinks
          latestHandId={latestHandId}
          latestHandLoading={latestReplayLoading}
          latestHandError={latestReplayError}
          lessonsEnabled
          onReplayLastHand={(handId) => router.push(`/replay/${encodeURIComponent(handId)}`)}
          onCommunityHand={() => {
            const hand = getDefaultCommunityHand();
            router.push(`/replay/community/${encodeURIComponent(hand.id)}`);
          }}
          onPokerSchool={() => router.push("/lessons")}
        />
        <LobbyTabs
          active={activeTab}
          onChange={setActiveTab}
          tournamentsBadgeCount={joinedTournamentsCount}
        />
        {activeTab === "cash" ? (
          <>
            <InstantGamePanels inFlightPreset={instantStartInFlightPreset} onStart={handleStartInstantGame} />
            <View className="ui-row gap-3 mt-2 border-b border-border pb-2">
              <GameListHeader
                onSort={cycleSort}
                onCreateGame={() => {
                  if (!authToken) {
                    router.push(loginPathWithNext("/lobby"));
                    return;
                  }
                  setCreateModalVisible(true);
                }}
                sortLabel={`Sort: ${sortKey}`}
                createLabel={authToken ? "New Game" : "Login / Register"}
              />
            </View>
            <View className="flex-1 flex-row flex-wrap p-4 pb-1">
              {busy ? (
                Array.from({ length: skeletonCount }).map((_, idx) => (
                  <View key={`skeleton-${idx}`} className="w-full pb-3 md:w-1/2 md:px-1.5 lg:w-1/3">
                    <GameTablePanelSkeleton />
                  </View>
                ))
              ) : error ? (
                <Text variant="danger" className="ui-stack-2 py-4">
                  {error}
                </Text>
              ) : sortedTables.length === 0 ? (
                <EmptyState message="No games available. Create one!" />
              ) : (
                sortedTables.map((t) => (
                  <View key={t.id} className="w-full pb-3 md:w-1/2 md:px-1.5 lg:w-1/3">
                    <GameTablePanel
                      table={t}
                      balanceCents={bankroll}
                      isJoining={isJoining(t.id)}
                      currentUserId={profile.userId}
                      onJoin={() => {
                        if (isJoining(t.id)) return;
                        if (!authToken) {
                          router.push(loginPathWithNext(tablePath(t.id, { buyInCents: t.minBuyInCents })));
                          return;
                        }
                        setChooseTableModal({
                          id: t.id,
                          roomId: t.roomId,
                          minBuyInCents: t.minBuyInCents,
                          maxBuyInCents: t.maxBuyInCents,
                        });
                      }}
                      onDelete={handleDeleteTable}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <JoinedTournamentsSection
              tournaments={tournamentList}
              authenticated={authenticated}
              actionInFlight={tournamentActionBusy || registerBusy}
              onTournamentAction={handleTournamentAction}
              onOpenTournamentDetail={handleOpenTournamentDetail}
              onDeleteTournament={authenticated ? handleDeleteTournament : undefined}
              deleteInFlightId={tournamentDeleteId}
            />
            <TournamentsSection
              tournaments={tournamentList}
              busy={tournamentsBusy}
              error={tournamentsError}
              authenticated={authenticated}
              actionInFlight={tournamentActionBusy || registerBusy}
              onTournamentAction={handleTournamentAction}
              onOpenTournamentDetail={handleOpenTournamentDetail}
              onRetry={() => { void refreshTournaments(); }}
              onCreateTournament={handleCreateTournament}
              onDeleteTournament={authenticated ? handleDeleteTournament : undefined}
              deleteInFlightId={tournamentDeleteId}
            />
          </>
        )}
      </ScrollView>
      <CreateGameModal visible={createModalVisible} onClose={() => setCreateModalVisible(false)} onSubmit={handleCreateGame} />
      <TournamentCreateModal
        visible={tournamentCreateModalVisible}
        onClose={() => setTournamentCreateModalVisible(false)}
        onCreated={() => { void refreshTournaments(); }}
      />
      <TournamentRegisterModal
        visible={registerModalTournament != null}
        tournament={registerModalTournament}
        balanceCents={bankroll}
        busy={registerBusy}
        onClose={() => setRegisterModalTournament(null)}
        onConfirm={() => void handleConfirmTournamentRegister()}
      />
      <TournamentJoinModal
        visible={joinModalTournament != null}
        tournament={joinModalTournament}
        busy={tournamentActionBusy}
        onClose={() => setJoinModalTournament(null)}
        onConfirm={handleConfirmTournamentJoin}
      />
      <TournamentStandingsModal
        visible={standingsModal != null}
        tournamentId={standingsModal?.id ?? null}
        tournamentName={standingsModal?.name}
        tournamentStatus={standingsModal?.status}
        onClose={() => setStandingsModal(null)}
      />
      {chooseTableModal && (
        <ChooseTableModal
          visible
          onClose={() => setChooseTableModal(null)}
          balanceCents={bankroll}
          minBuyInCents={chooseTableModal.minBuyInCents}
          maxBuyInCents={chooseTableModal.maxBuyInCents}
          onApply={handleJoinApply}
        />
      )}
      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />
    </Screen>
  );
}

