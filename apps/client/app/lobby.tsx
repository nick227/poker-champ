import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BankrollDisplay } from "@/components/domain/lobby/BankrollDisplay";
import { GameListHeader } from "@/components/domain/lobby/GameListHeader";
import { GameTableRow } from "@/components/domain/lobby/GameTableRow";
import { EmptyState } from "@/components/domain/lobby/EmptyState";
import { CreateGameModal } from "@/components/domain/lobby/CreateGameModal";
import { ChooseTableModal } from "@/components/domain/lobby/ChooseTableModal";
import { TableNotificationBell } from "@/components/domain/table/TableNotificationBell";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { Loader } from "@/components/base/Loader";
import { Text } from "@/components/base/Text";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtime } from "@/realtime/useLobbyRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { postCreateTable } from "@/services/post/lobby.post";
import { useToastStore } from "@/stores/toast.store";
import { normalizeTable } from "@/lib/lobbyTables";
import { tablePath } from "@/lib/nav";

type SortKey = "name" | "players" | "blinds";

const SORT_COMPARATORS: Record<SortKey, (a: ReturnType<typeof normalizeTable>, b: ReturnType<typeof normalizeTable>) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  players: (a, b) => b.players - a.players,
  blinds: (a, b) => (a.blinds ?? "").localeCompare(b.blinds ?? ""),
};

const SORT_CYCLE: Record<SortKey, SortKey> = { name: "players", players: "blinds", blinds: "name" };

export default function LobbyScreen() {
  const router = useRouter();
  const { tables, refresh, busy, error } = storeRegistry.use.lobby();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const { cents: bankroll } = useBankroll();
  const profile = useProfile();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chooseTableModal, setChooseTableModal] = useState<{
    id: string;
    minBuyInCents: number;
    maxBuyInCents: number;
  } | null>(null);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);

  useLobbyRealtime();
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh({ background: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const sortedTables = useMemo(() => {
    const rows = tables.map(normalizeTable);
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

  const handleJoinApply = useCallback((opts: { buyInCents: number }) => {
    if (!chooseTableModal) return;
    openTable(chooseTableModal.id, { buyInCents: opts.buyInCents });
    router.push(tablePath(chooseTableModal.id, { buyInCents: opts.buyInCents }));
    setChooseTableModal(null);
  }, [chooseTableModal, openTable, router]);

  const activeTableRows = useMemo(() =>
    openTableIds.map((id) => ({ id, potCents: 1480, bankCents: 105950, betCents: 250, isYourTurn: false })),
    [openTableIds]
  );

  return (
    <Screen>
      <View className="flex-1 ui-col gap-4">
        <Masthead />
        <ProfileStrip username={profile.username ?? "Player"} location={profile.location} />
        <View className="ui-row ui-inline-2 ui-section-tight">
          <Button variant="ghost" title="My Account" onPress={() => {}} />
          <Button variant="ghost" title="Deposit" onPress={() => {}} />
          <TableNotificationBell count={openTableIds.length} onPress={() => setActiveTablesDropdownVisible(true)} />
        </View>
        <BankrollDisplay amountCents={bankroll} />
        <View className="ui-section-tight ui-stack-1">
          <Text variant="label">Status</Text>
          <Text variant="muted">{busy ? "Loading..." : error ?? "Active"}</Text>
        </View>
        <GameListHeader onSort={cycleSort} onCreateGame={() => setCreateModalVisible(true)} sortLabel={`Sort: ${sortKey}`} />
        <View className="flex-1 ui-col gap-3">
        {busy ? (
          <Loader />
        ) : error ? (
          <View className="ui-stack-2 ui-p-4">
            <Button title={`Retry: ${error}`} onPress={refresh} />
          </View>
        ) : sortedTables.length === 0 ? (
          <EmptyState message="No games available. Create one!" />
        ) : (
          sortedTables.map((t) => (
            <GameTableRow
              key={t.id}
              table={t}
              onJoin={() => setChooseTableModal({ id: t.id, minBuyInCents: t.minBuyInCents, maxBuyInCents: t.maxBuyInCents })}
            />
          ))
        )}
        </View>
      </View>
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
      <ActiveTablesDropdown
        visible={activeTablesDropdownVisible}
        onClose={() => setActiveTablesDropdownVisible(false)}
        tables={activeTableRows}
        onSelectTable={(id) => {
        setActive(id);
        router.push(tablePath(id));
        setActiveTablesDropdownVisible(false);
      }}
      />
      <BottomBar active="lobby" />
    </Screen>
  );
}
