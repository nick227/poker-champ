import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { GameListHeader } from "@/components/domain/lobby/GameListHeader";
import { InstantGamePanels } from "@/components/domain/lobby/InstantGamePanels";
import { ReplayQuickLinks } from "@/components/domain/lobby/ReplayQuickLinks";
import { GameTablePanel } from "@/components/domain/lobby/GameTablePanel";
import { GameTablePanelSkeleton } from "@/components/domain/lobby/GameTablePanelSkeleton";
import { EmptyState } from "@/components/domain/lobby/EmptyState";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { CreateGameModal } from "@/components/domain/lobby/CreateGameModal";
import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
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
  type InstantGamePresetId,
} from "@/components/domain/lobby/instantGame.presets";

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
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const { cents: bankroll } = useBankroll();
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
  const { beginJoining, clearJoining, isJoining } = useJoiningTableState();
  const {
    latestHandId,
    loading: latestReplayLoading,
    error: latestReplayError,
  } = useLatestReplayHand();

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh({ background: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

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
    if (bankroll < createConfig.minBuyInCents) {
      useToastStore
        .getState()
        .show("Insufficient bankroll for instant game. Deposit or choose a lower-stakes table.", "danger");
      return;
    }

    setInstantStartInFlightPreset(presetId);
    const unlockTimer = setTimeout(() => setInstantStartInFlightPreset(null), 15000);

    try {
      const created = await postCreateInstantGame({ presetId, config: createConfig });
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
            You just completed a lesson. Apply it at a table below.
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
            <View className="ui-stack-2 py-8">
              <Button title={`Retry: ${error}`} onPress={refresh} />
            </View>
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
