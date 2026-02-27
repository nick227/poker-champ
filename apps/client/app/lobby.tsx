import { useCallback, useEffect, useMemo, useState } from "react";
import { View, useWindowDimensions, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { GameListHeader } from "@/components/domain/lobby/GameListHeader";
import { InstantGamePanels } from "@/components/domain/lobby/InstantGamePanels";
import { GameTablePanel } from "@/components/domain/lobby/GameTablePanel";
import { GameTablePanelSkeleton } from "@/components/domain/lobby/GameTablePanelSkeleton";
import { EmptyState } from "@/components/domain/lobby/EmptyState";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { CreateGameModal } from "@/components/domain/lobby/CreateGameModal";
import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useJoiningTableState } from "@/hooks/useJoiningTableState";
import { postCreateInstantGame, postCreateTable } from "@/services/post/lobby.post";
import { useToastStore } from "@/stores/toast.store";
import { normalizeTable } from "@/lib/lobbyTables";
import { confirmDeleteTable } from "@/lib/deleteTable";
import { tablePath } from "@/lib/nav";
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
  const { width } = useWindowDimensions();

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
    try {
      await postCreateTable(config);
      refresh();
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Failed to create game", "danger");
    }
  };

  const handleStartInstantGame = useCallback(async (presetId: InstantGamePresetId) => {
    if (instantStartInFlightPreset) return;
    setInstantStartInFlightPreset(presetId);
    const unlockTimer = setTimeout(() => setInstantStartInFlightPreset(null), 15000);

    try {
      const createConfig = buildInstantCreateTableConfig(presetId);
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
  }, [instantStartInFlightPreset, openTable, refresh, router]);

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
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        amountCents={bankroll}
        avatarUrl={profile.avatarUrl}
      />
      <ScrollView className="flex-1">
        <GameListHeader onSort={cycleSort} onCreateGame={() => setCreateModalVisible(true)} sortLabel={`Sort: ${sortKey}`} />
        <InstantGamePanels inFlightPreset={instantStartInFlightPreset} onStart={handleStartInstantGame} />
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
          maxBuyInCents={Math.min(chooseTableModal.maxBuyInCents, bankroll)}
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
