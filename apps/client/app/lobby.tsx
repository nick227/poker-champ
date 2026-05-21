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
import { TournamentsSection } from "@/features/lobby";
import { TournamentRegisterModal } from "@/features/lobby";
import { TournamentStandingsModal } from "@/features/lobby";
import { GameTablePanel } from "@/features/lobby";
import { GameTablePanelSkeleton } from "@/features/lobby";
import { EmptyState } from "@/features/lobby";
import { OnlinePlayersSheet } from "@/features/lobby";
import { CreateGameModal } from "@/features/lobby";
import { ChooseTableModal } from "@/features/lobby";
import { BottomBar } from "@/components/containers/BottomBar";
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
import { getDefaultCommunityHand } from "@/features/replay/community/communityHands";
import { useAuthStore } from "@/stores/auth.store";
import {
  buildInstantCreateTableConfig,
  getInstantGamePreset,
  type InstantGamePresetId,
} from "@/features/lobby";
import { postTournamentRegister, postTournamentUnregister } from "@/services/post/tournaments.post";
import { mapTournamentErrorMessage, resolveTournamentCta } from "@/lib/tournament.utils";
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
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const { cents: bankroll, refresh: refreshBankroll } = useBankroll();
  const profile = useProfile();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [instantStartInFlightPreset, setInstantStartInFlightPreset] = useState<InstantGamePresetId | null>(null);
  const [chooseTableModal, setChooseTableModal] = useState<{
    id: string;
    minBuyInCents: number;
    maxBuyInCents: number;
  } | null>(null);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const [registerModalTournament, setRegisterModalTournament] = useState<TournamentSummary | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [standingsModal, setStandingsModal] = useState<{ id: string; name: string } | null>(null);
  const [tournamentActionBusy, setTournamentActionBusy] = useState(false);
  const { beginJoining, clearJoining, isJoining } = useJoiningTableState();
  const {
    latestHandId,
    loading: latestReplayLoading,
    error: latestReplayError,
  } = useLatestReplayHand();

  useEffect(() => {
    void refresh();
    void refreshTournaments();
  }, [refresh, refreshTournaments]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh({ background: true });
      void refreshTournaments({ background: true });
    }, 30_000);
    return () => clearInterval(timer);
  }, [refresh, refreshTournaments]);

  const sortedTables = useMemo(() => {
    const rows = tables.map((t: unknown) => normalizeTable(t as Record<string, unknown>));
    return [...rows].sort(SORT_COMPARATORS[sortKey]);
  }, [tables, sortKey]);

  const cycleSort = useCallback(() => setSortKey((k) => SORT_CYCLE[k]), []);

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
  }, [authToken, bankroll, instantStartInFlightPreset, openTable, refresh, router]);

  const handleJoinApply = useCallback((opts: { buyInCents: number }) => {
    if (!chooseTableModal) return;
    const targetTableId = chooseTableModal.id;
    beginJoining(targetTableId);

    try {
      openTable(targetTableId, { buyInCents: opts.buyInCents });
      router.push(tablePath(targetTableId, { buyInCents: opts.buyInCents }));
      setChooseTableModal(null);
      clearJoining(targetTableId);
    } catch (e) {
      clearJoining(targetTableId);
      useToastStore.getState().show((e as Error).message ?? "Failed to join table", "danger");
    }
  }, [beginJoining, chooseTableModal, clearJoining, openTable, router]);

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

  const handleTournamentAction = useCallback(
    (tournament: TournamentSummary) => {
      if (tournamentActionBusy) return;
      const cta = resolveTournamentCta(tournament, { authenticated: Boolean(authToken) });

      if (cta.action === "none" || cta.disabled) return;

      if (!authToken && cta.action !== "standings") {
        router.push(loginPathWithNext("/lobby"));
        return;
      }

      if (cta.action === "register") {
        setRegisterModalTournament(tournament);
        return;
      }

      if (cta.action === "unregister") {
        setTournamentActionBusy(true);
        void postTournamentUnregister(tournament.id)
          .then(() => {
            useToastStore.getState().show("Unregistered from tournament", "success");
            void refreshTournaments();
            void refreshBankroll();
          })
          .catch((e: unknown) => {
            const message = e instanceof Error ? e.message : "Unregister failed";
            useToastStore.getState().show(mapTournamentErrorMessage(message), "danger");
          })
          .finally(() => setTournamentActionBusy(false));
        return;
      }

      if (cta.action === "join" && tournament.tableId) {
        openTable(tournament.tableId);
        router.push(tablePath(tournament.tableId));
        return;
      }

      if (cta.action === "standings") {
        setStandingsModal({ id: tournament.id, name: tournament.name });
      }
    },
    [authToken, openTable, refreshBankroll, refreshTournaments, router, tournamentActionBusy],
  );

  const handleConfirmTournamentRegister = useCallback(async () => {
    if (!registerModalTournament) return;
    setRegisterBusy(true);
    try {
      await postTournamentRegister(registerModalTournament.id);
      useToastStore.getState().show("Registered for tournament", "success");
      setRegisterModalTournament(null);
      void refreshTournaments();
      void refreshBankroll();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Registration failed";
      useToastStore.getState().show(mapTournamentErrorMessage(message), "danger");
    } finally {
      setRegisterBusy(false);
    }
  }, [registerModalTournament, refreshBankroll, refreshTournaments]);

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
        <InstantGamePanels inFlightPreset={instantStartInFlightPreset} onStart={handleStartInstantGame} />
        <TournamentsSection
          tournaments={tournamentList}
          busy={tournamentsBusy}
          error={tournamentsError}
          authenticated={Boolean(authToken)}
          actionInFlight={tournamentActionBusy || registerBusy}
          onTournamentAction={handleTournamentAction}
        />
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
        <View className="flex-1 ui-column gap-3 p-4">
          {busy ? (
            Array.from({ length: skeletonCount }).map((_, idx) => (
              <GameTablePanelSkeleton key={`skeleton-${idx}`} />
            ))
          ) : error ? (
            <Text variant="danger" className="ui-stack-2 py-4">
              {error}
            </Text>
          ) : sortedTables.length === 0 ? (
            <EmptyState message="No games available. Create one!" />
          ) : (
            sortedTables.map((t) => (
              <GameTablePanel
                key={t.id}
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
                  setChooseTableModal({ id: t.id, minBuyInCents: t.minBuyInCents, maxBuyInCents: t.maxBuyInCents });
                }}
                onDelete={handleDeleteTable}
              />
            ))
          )}
        </View>
      </ScrollView>
      <CreateGameModal visible={createModalVisible} onClose={() => setCreateModalVisible(false)} onSubmit={handleCreateGame} />
      <TournamentRegisterModal
        visible={registerModalTournament != null}
        tournament={registerModalTournament}
        balanceCents={bankroll}
        busy={registerBusy}
        onClose={() => setRegisterModalTournament(null)}
        onConfirm={() => void handleConfirmTournamentRegister()}
      />
      <TournamentStandingsModal
        visible={standingsModal != null}
        tournamentId={standingsModal?.id ?? null}
        tournamentName={standingsModal?.name}
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
      <BottomBar active="lobby" />
    </Screen>
  );
}

