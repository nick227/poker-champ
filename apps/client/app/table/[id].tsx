import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { MultiTableTabs } from "@/components/domain/table/MultiTableTabs";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { PlayerHistoryPopup } from "@/components/domain/table/PlayerHistoryPopup";
import { ChatOverlay } from "@/components/domain/table/ChatOverlay";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { storeRegistry } from "@/registry/store.registry";
import { useTableRealtime } from "@/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { lobbyPath, loginPathWithNext, tablePath } from "@/lib/nav";
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
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{ id: string; buyInCents?: string }>();
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const activeTableId = storeRegistry.use.tables((s) => s.activeTableId);
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const closeTable = storeRegistry.use.tables((s) => s.closeTable);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const dispatchTableAction = storeRegistry.use.tables((s) => s.dispatchTableAction);
  const dispatchAddBot = storeRegistry.use.tables((s) => s.dispatchAddBot);
  const dispatchRemoveBot = storeRegistry.use.tables((s) => s.dispatchRemoveBot);
  const joinState = storeRegistry.use.tables((s) => (id ? s.tableJoinById[String(id)] : undefined));
  const lobbyTables = storeRegistry.use.lobby((s) => s.tables);
  const snapshotsByTableId = storeRegistry.use.table((s) => s.snapshotsByTableId);
  const tableStatusByTableId = storeRegistry.use.table((s) => s.statusByTableId);
  const tableErrorByTableId = storeRegistry.use.table((s) => s.errorByTableId);
  const authHydrated = storeRegistry.use.auth((s) => s.hydrated);
  const authToken = storeRegistry.use.auth((s) => s.token);

  const tableId = id ? String(id) : "demo";
  const routeBuyInCents = useMemo(() => {
    const raw = Array.isArray(buyInCentsParam) ? buyInCentsParam[0] : buyInCentsParam;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }, [buyInCentsParam]);
  const { cents: balanceCents } = useBankroll();
  const [playerPopup, setPlayerPopup] = useState<{ name: string; vpip?: number; pfr?: number; hands?: number; joinDate?: string; location?: string } | null>(null);
  const [lastShownHandResultId, setLastShownHandResultId] = useState<string | null>(null);
  const [handResultMessage, setHandResultMessage] = useState<{
    winnerName: string;
    amountCents: number;
    winningHandDescr?: string;
  } | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);

  const snapshot = snapshotsByTableId[tableId];
  const tableStatus = tableStatusByTableId[tableId] ?? "DISCONNECTED";
  const tableError = tableErrorByTableId[tableId];
  const opponents = useMemo(() => (snapshot ? mapSeatsToOpponents(snapshot) : []), [snapshot]);

  useEffect(() => {
    if (!tableId) return;
    const hasOpenTable = openTableIds.includes(tableId);
    const shouldPersistRouteBuyIn =
      Number.isInteger(routeBuyInCents) &&
      Number(routeBuyInCents) > 0 &&
      routeBuyInCents !== joinState?.buyInCents;

    if (!hasOpenTable) {
      openTable(tableId, shouldPersistRouteBuyIn ? { buyInCents: routeBuyInCents } : undefined);
    } else if (shouldPersistRouteBuyIn) {
      openTable(tableId, { buyInCents: routeBuyInCents });
    }

    if (activeTableId !== tableId) setActive(tableId);
  }, [tableId, routeBuyInCents, joinState?.buyInCents, openTableIds, activeTableId, openTable, setActive]);

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
    if (routeBuyInCents) return routeBuyInCents;
    const persisted = joinState?.buyInCents;
    if (Number.isInteger(persisted) && Number(persisted) > 0) return Number(persisted);
    const table = lobbyTables.map((t) => normalizeTable(t as Record<string, unknown>)).find((t) => t.id === tableId);
    const min = table?.minBuyInCents;
    return min && min > 0 ? min : undefined;
  }, [routeBuyInCents, joinState?.buyInCents, lobbyTables, tableId]);

  const realtimeRoomId = useMemo(() => {
    const byRoomId = lobbyTables.find((t) => String((t as any)?.roomId ?? "") === tableId);
    if (byRoomId) return tableId;
    const byTableId = lobbyTables.find((t) => String((t as any)?.tableId ?? "") === tableId);
    const mappedRoomId = (byTableId as any)?.roomId;
    if (typeof mappedRoomId === "string" && mappedRoomId.length > 0) return mappedRoomId;
    return tableId;
  }, [lobbyTables, tableId]);

  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const shouldConnectRealtime = Boolean(snapshot) || hasValidBuyIn;
  const canConnectWithAuth = authHydrated && Boolean(authToken);
  const tableNextPath = useMemo(
    () => tablePath(tableId, routeBuyInCents ? { buyInCents: routeBuyInCents } : undefined),
    [tableId, routeBuyInCents],
  );

  useEffect(() => {
    if (!authHydrated) return;
    if (authToken) return;
    router.replace(loginPathWithNext(tableNextPath));
  }, [authHydrated, authToken, router, tableNextPath]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[TABLE_SCREEN]", {
      tableId,
      routeBuyInCents,
      storedBuyInCents: joinState?.buyInCents,
      resolvedBuyInCents: buyInCents,
      hasValidBuyIn,
      shouldConnectRealtime,
      authHydrated,
      hasAuthToken: Boolean(authToken),
      realtimeRoomId,
      status: tableStatus,
      hasSnapshot: Boolean(snapshot),
      tableError,
    });
  }, [tableId, routeBuyInCents, joinState?.buyInCents, buyInCents, hasValidBuyIn, shouldConnectRealtime, authHydrated, authToken, realtimeRoomId, tableStatus, snapshot, tableError]);

  useTableRealtime({
    tableId,
    roomId: realtimeRoomId,
    buyInCents,
    enabled: shouldConnectRealtime && canConnectWithAuth,
    onError: (message) => {
      console.log("TABLE_REALTIME_ERROR", message);
    },
  });

  const sendAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
      // eslint-disable-next-line no-console
      console.log("[TABLE_ACTION_SEND]", { tableId, action, amountCents: payload.amount });
      const ok = dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("TABLE_ACTION_FALLBACK", { action, tableId, reason: "sender-not-registered-or-invalid-payload" });
      }
    },
    [tableId, dispatchTableAction]
  );

  useEffect(() => {
    const result = snapshot?.lastHandResult;
    if (!result || !snapshot) return;
    if (result.handId === lastShownHandResultId) return;
    setLastShownHandResultId(result.handId);
    const winnerId = result.winnerId ?? Object.keys(result.payoutsByUserId ?? {})[0];
    const winnerName =
      winnerId ? snapshot.seats.find((s) => s.userId === winnerId)?.name || "Winner" : "Split pot";
    const amountCents =
      winnerId && result.payoutsByUserId
        ? result.payoutsByUserId[winnerId] ?? result.potCents
        : result.potCents;
    setHandResultMessage({
      winnerName,
      amountCents,
      winningHandDescr: result.winningHandDescr,
    });
    const t = setTimeout(() => setHandResultMessage(null), 3000);
    return () => clearTimeout(t);
  }, [snapshot?.lastHandResult, snapshot, lastShownHandResultId]);

  const hasSnapshot = Boolean(snapshot);
  const hasActiveHand = Boolean(snapshot?.hand);

  return (
    <Screen>
      <View className="ui-p-stack-2">
        <MultiTableTabs onOpenMoreTables={() => setActiveTablesDropdownVisible(true)} />
      </View>
      {!authHydrated ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Restoring session..." onPress={() => {}} />
        </View>
      ) : !authToken ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Session required. Redirecting to login..." onPress={() => router.replace(loginPathWithNext(tableNextPath))} />
        </View>
      ) : !hasSnapshot ? (
        <View className="flex-1 ui-center ui-stack-4">
          {!hasValidBuyIn ? (
            <Button title="Missing buy-in data. Return to lobby." onPress={() => router.replace(lobbyPath())} />
          ) : tableError ? (
            <Button title={`${tableError}. Return to lobby.`} onPress={() => router.replace(lobbyPath())} />
          ) : (
            <Button title={`Waiting for table snapshot (${tableStatus}).`} onPress={() => router.replace(lobbyPath())} />
          )}
        </View>
      ) : !hasActiveHand ? (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title={`Connected. Waiting for another active player to start a hand (${tableStatus}).`} onPress={() => {}} />
          {snapshot?.hero.youAreSeated && buyInCents ? (
            <Button
              variant="ghost"
              title="+ Add Bot To Start Hand"
              onPress={() => dispatchAddBot({ tableId, buyInCents })}
            />
          ) : null}
          <Button variant="ghost" title="Return to lobby" onPress={() => router.replace(lobbyPath())} />
        </View>
      ) : (
        <TableLayout
          snapshot={snapshot!}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          handResultMessage={handResultMessage ?? undefined}
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
