import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { MultiTableTabs } from "@/components/domain/table/MultiTableTabs";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { PlayerHistoryPopup } from "@/components/domain/table/PlayerHistoryPopup";
import { HandResultOverlay } from "@/components/domain/table/HandResultOverlay";
import { ChatOverlay } from "@/components/domain/table/ChatOverlay";
import { mapSeatsToOpponents, getCommunityCards, getHeroCards, getPotCents } from "@/components/domain/table/table.adapter";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { storeRegistry } from "@/registry/store.registry";
import { useTableRealtime } from "@/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { lobbyPath, tablePath } from "@/lib/nav";
import { normalizeTable } from "@/lib/lobbyTables";

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const closeTable = storeRegistry.use.tables((s) => s.closeTable);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const dispatchTableAction = storeRegistry.use.tables((s) => s.dispatchTableAction);
  const dispatchAddBot = storeRegistry.use.tables((s) => s.dispatchAddBot);
  const dispatchRemoveBot = storeRegistry.use.tables((s) => s.dispatchRemoveBot);
  const lobbyTables = storeRegistry.use.lobby((s) => s.tables);
  const snapshotsByTableId = storeRegistry.use.table((s) => s.snapshotsByTableId);
  const tableStatusByTableId = storeRegistry.use.table((s) => s.statusByTableId);

  const tableId = id ? String(id) : "demo";
  const { cents: balanceCents } = useBankroll();
  const [playerPopup, setPlayerPopup] = useState<{ name: string; vpip?: number; pfr?: number; hands?: number; joinDate?: string; location?: string } | null>(null);
  const [handResultVisible, setHandResultVisible] = useState(false);
  const [lastShownHandResultId, setLastShownHandResultId] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);

  const snapshot = snapshotsByTableId[tableId];
  const tableStatus = tableStatusByTableId[tableId] ?? "DISCONNECTED";
  const opponents = useMemo(() => (snapshot ? mapSeatsToOpponents(snapshot) : []), [snapshot]);

  useEffect(() => {
    if (!tableId) return;
    if (!openTableIds.includes(tableId)) openTable(tableId);
    setActive(tableId);
  }, [tableId, openTableIds, openTable, setActive]);

  const activeTableRows = useMemo(
    () =>
      openTableIds.map((oid) => {
        const s = snapshotsByTableId[oid];
        const heroSeatForTable = s?.hero.seat != null ? s.seats.find((seat) => seat.seat === s.hero.seat) : undefined;
        return {
          id: oid,
          potCents: s?.hand?.potCents ?? s?.lastHandResult?.potCents ?? 0,
          bankCents: heroSeatForTable?.stackCents ?? 0,
          betCents: heroSeatForTable?.roundBetCents ?? 0,
          isYourTurn: Boolean(heroSeatForTable?.isToAct),
        };
      }),
    [openTableIds, snapshotsByTableId]
  );

  const handleSelectTable = useCallback(
    (targetId: string) => {
      setActive(targetId);
      router.push(tablePath(targetId));
      setActiveTablesDropdownVisible(false);
    },
    [setActive, router]
  );

  const buyInCents = useMemo(() => {
    const table = lobbyTables.map((t) => normalizeTable(t as Record<string, unknown>)).find((t) => t.id === tableId);
    const min = table?.minBuyInCents;
    return min && min > 0 ? min : undefined;
  }, [lobbyTables, tableId]);

  useTableRealtime({
    tableId,
    buyInCents,
    onError: (message) => {
      console.log("TABLE_REALTIME_ERROR", message);
    },
  });

  const sendAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
      const ok = dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (!ok) console.log("TABLE_ACTION_FALLBACK", { action, tableId });
    },
    [tableId, dispatchTableAction]
  );

  useEffect(() => {
    const result = snapshot?.lastHandResult;
    if (!result) return;
    if (result.handId === lastShownHandResultId) return;
    setLastShownHandResultId(result.handId);
    setHandResultVisible(true);
  }, [snapshot?.lastHandResult, lastShownHandResultId]);

  const winnerName = useMemo(() => {
    const winnerId = snapshot?.lastHandResult?.winnerId;
    if (!winnerId || !snapshot) return "Winner";
    return snapshot.seats.find((s) => s.userId === winnerId)?.name || "Winner";
  }, [snapshot]);

  const missingBuyIn = !buyInCents;
  const showLiveTable = !missingBuyIn && !!snapshot && !!snapshot.hand;
  const communityCards = useMemo(() => (snapshot ? getCommunityCards(snapshot) : []), [snapshot]);
  const heroCards = useMemo(() => (snapshot ? getHeroCards(snapshot) : []), [snapshot]);
  const potCents = snapshot ? getPotCents(snapshot) : 0;

  return (
    <Screen>
      <View className="ui-p-stack-2">
        <MultiTableTabs onOpenMoreTables={() => setActiveTablesDropdownVisible(true)} />
      </View>
      {missingBuyIn ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Missing buy-in data. Return to lobby." onPress={() => router.replace(lobbyPath())} />
        </View>
      ) : !showLiveTable ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title={`Waiting for table snapshot (${tableStatus}).`} onPress={() => router.replace(lobbyPath())} />
        </View>
      ) : (
        <TableLayout
          snapshot={snapshot}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          topBarLeft={<Button variant="ghost" title="<" onPress={() => router.back()} />}
          topBarRight={
            <View className="ui-row ui-inline-1">
              {snapshot?.hero.youAreSeated && buyInCents ? (
                <Button
                  variant="ghost"
                  title="+ Bot"
                  onPress={() => dispatchAddBot({ tableId, buyInCents })}
                />
              ) : null}
              <IconButton icon={<Icon name="chat" />} onPress={() => setChatVisible(true)} />
              <Button
                variant="ghost"
                title="X"
                onPress={() => {
                  if (id) {
                    closeTable(String(id));
                    storeRegistry.table().clearTable(String(id));
                  }
                  router.replace(lobbyPath());
                }}
              />
            </View>
          }
          onAction={sendAction}
          onPlayerPress={(o) => {
            if (o.isBot) {
              dispatchRemoveBot({ tableId, botId: o.id });
            } else {
              setPlayerPopup({ name: o.name, vpip: 42, pfr: 18, hands: 150, joinDate: "2024-01-15", location: "US" });
            }
          }}
        />
      )}
      <HandResultOverlay
        visible={handResultVisible && Boolean(snapshot?.lastHandResult)}
        winnerName={winnerName}
        winnerCards={heroCards.filter((c): c is { rank: string; suit: string } => Boolean(c))}
        opponentCards={communityCards.filter((c): c is { rank: string; suit: string } => Boolean(c)).slice(0, 2)}
        potCents={snapshot?.lastHandResult?.potCents ?? potCents}
        onDeal={() => setHandResultVisible(false)}
      />
      <ChatOverlay visible={chatVisible} onClose={() => setChatVisible(false)} messages={[]} onSend={() => {}} />
      {playerPopup && (
        <PlayerHistoryPopup
          visible
          onClose={() => setPlayerPopup(null)}
          name={playerPopup.name}
          vpip={playerPopup.vpip}
          pfr={playerPopup.pfr}
          hands={playerPopup.hands}
          joinDate={playerPopup.joinDate}
          location={playerPopup.location}
        />
      )}
      <ActiveTablesDropdown
        visible={activeTablesDropdownVisible}
        onClose={() => setActiveTablesDropdownVisible(false)}
        tables={activeTableRows}
        onSelectTable={handleSelectTable}
      />
      <BottomBar active="table" />
    </Screen>
  );
}
