import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { MultiTableTabs } from "@/components/domain/table/MultiTableTabs";
import { ActiveTablesDropdown } from "@/components/domain/table/ActiveTablesDropdown";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { EmptyTableView } from "@/components/domain/table/EmptyTableView";
import { ConnectingTableShell } from "@/components/domain/table/ConnectingTableShell";
import { TableTopBar } from "@/components/domain/table/TableTopBar";
import { PlayerHistoryPopup } from "@/components/domain/table/PlayerHistoryPopup";
import { ChatOverlay } from "@/components/domain/table/ChatOverlay";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { storeRegistry } from "@/registry/store.registry";
import { useTableRealtime } from "@/realtime/useTableRealtime";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useToastStore } from "@/stores/toast.store";
import { lobbyPath, loginPathWithNext, tablePath } from "@/lib/nav";
import { normalizeTable } from "@/lib/lobbyTables";
import { confirmDeleteTable } from "@/lib/deleteTable";
import type { TableLastAction } from "@poker-champ/realtime-contract";

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

function buildActionMessage(action: TableLastAction, actorName: string): string {
  const originSuffix =
    action.origin === "AUTO"
      ? " (auto)"
      : action.origin === "FORCED"
        ? " (forced)"
        : "";

  switch (action.action) {
    case "FOLD":
      return `${actorName} folds${originSuffix}`;
    case "CHECK":
      return `${actorName} checks${originSuffix}`;
    case "CALL":
      return `${actorName} calls ${formatCents(action.amountCents)}${originSuffix}`;
    case "BET":
      return `${actorName} bets ${formatCents(action.amountCents)}${originSuffix}`;
    case "RAISE":
      return action.raiseToCents != null
        ? `${actorName} raises to ${formatCents(action.raiseToCents)}${originSuffix}`
        : `${actorName} raises ${formatCents(action.amountCents)}${originSuffix}`;
    case "ALL_IN":
      return `${actorName} is all-in for ${formatCents(action.amountCents)}${originSuffix}`;
  }
}

export default function TableScreen() {
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{ id: string; buyInCents?: string }>();
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const activeTableId = storeRegistry.use.tables((s) => s.activeTableId);
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const closeTable = storeRegistry.use.tables((s) => s.closeTable);
  const setActive = storeRegistry.use.tables((s) => s.setActive);
  const persistedRoomId = storeRegistry.use.tables((s) => (id ? s.roomIdByTableId[String(id)] : undefined));
  const persistedBuyInCents = storeRegistry.use.tables((s) => (id ? s.lastBuyInCentsByTableId[String(id)] : undefined));
  const dispatchTableAction = storeRegistry.use.tables((s) => s.dispatchTableAction);
  const dispatchSendChat = storeRegistry.use.tables((s) => s.dispatchSendChat);
  const dispatchAddBot = storeRegistry.use.tables((s) => s.dispatchAddBot);
  const dispatchRemoveBot = storeRegistry.use.tables((s) => s.dispatchRemoveBot);
  const joinState = storeRegistry.use.tables((s) => (id ? s.tableJoinById[String(id)] : undefined));
  const lobbyTables = storeRegistry.use.lobby((s) => s.tables);
  const snapshotsByTableId = storeRegistry.use.table((s) => s.snapshotsByTableId);
  const chatMessagesByTableId = storeRegistry.use.table((s) => s.chatMessagesByTableId);
  const tableStatusByTableId = storeRegistry.use.table((s) => s.connectionStatusByTableId);
  const tableErrorByTableId = storeRegistry.use.table((s) => s.errorByTableId);
  const authHydrated = storeRegistry.use.auth((s) => s.hydrated);
  const authToken = storeRegistry.use.auth((s) => s.token);

  const tableId = id ? String(id) : "demo";
  const routeBuyInCents = useMemo(() => {
    const raw = Array.isArray(buyInCentsParam) ? buyInCentsParam[0] : buyInCentsParam;
    let parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlBuyIn = params.get("buyInCents");
      parsed = Number(urlBuyIn ?? "");
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return undefined;
  }, [buyInCentsParam]);
  const { cents: balanceCents } = useBankroll();
  const profile = useProfile();
  const lobbyTable = useMemo(
    () => lobbyTables.map((t) => normalizeTable(t as Record<string, unknown>)).find((t) => t.id === tableId),
    [lobbyTables, tableId],
  );
  const canDeleteTable =
    Boolean(profile.userId && lobbyTable?.creatorId === profile.userId && (lobbyTable?.humanCount ?? 0) === 0);

  const handleDeleteTable = useCallback(() => {
    confirmDeleteTable(tableId, {
      onSuccess: () => {
        closeTable(tableId);
        storeRegistry.table().clearTable(tableId);
        storeRegistry.lobby().refresh();
        router.replace(lobbyPath());
      },
    });
  }, [tableId, closeTable, router]);

  const [playerPopup, setPlayerPopup] = useState<{ name: string; vpip?: number; pfr?: number; hands?: number; joinDate?: string; location?: string } | null>(null);
  const [lastShownHandResultId, setLastShownHandResultId] = useState<string | null>(null);
  const [lastShownActionKey, setLastShownActionKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [handResultMessage, setHandResultMessage] = useState<{
    winnerName: string;
    amountCents: number;
    winningHandDescr?: string;
  } | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [lastSeenChatCountByTableId, setLastSeenChatCountByTableId] = useState<Record<string, number>>({});
  const [activeTablesDropdownVisible, setActiveTablesDropdownVisible] = useState(false);
  const [outOfChipsNoticeShownForHandId, setOutOfChipsNoticeShownForHandId] = useState<string | null>(null);
  const [addBotPending, setAddBotPending] = useState(false);
  const addBotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = snapshotsByTableId[tableId];
  const tableStatus = tableStatusByTableId[tableId] ?? "DISCONNECTED";
  const tableError = tableErrorByTableId[tableId];
  const opponents = useMemo(() => (snapshot ? mapSeatsToOpponents(snapshot) : []), [snapshot]);
  const heroUserId = snapshot?.hero?.userId;
  const chatMessagesForOverlay = useMemo(() => {
    const list = chatMessagesByTableId[tableId] ?? [];
    return list.map((m) => ({
      id: m.id,
      sender: m.senderName,
      text: m.text,
      isSelf: heroUserId != null && m.senderUserId === heroUserId,
    }));
  }, [chatMessagesByTableId, tableId, heroUserId]);

  const unseenChatCount =
    (lastSeenChatCountByTableId[tableId] ?? 0) < chatMessagesForOverlay.length
      ? chatMessagesForOverlay.length - (lastSeenChatCountByTableId[tableId] ?? 0)
      : 0;

  useEffect(() => {
    if (chatVisible) {
      setLastSeenChatCountByTableId((prev) => ({ ...prev, [tableId]: chatMessagesForOverlay.length }));
    } else if (lastSeenChatCountByTableId[tableId] === undefined) {
      setLastSeenChatCountByTableId((prev) => ({ ...prev, [tableId]: chatMessagesForOverlay.length }));
    }
  }, [chatVisible, tableId, chatMessagesForOverlay.length, lastSeenChatCountByTableId[tableId]]);

  useEffect(() => {
    if (tableId && lobbyTables.length === 0) {
      storeRegistry.lobby().refresh();
    }
  }, [tableId, lobbyTables.length]);

  useEffect(() => {
    setLastShownActionKey(null);
    setActionMessage(null);
    setLastShownHandResultId(null);
    setHandResultMessage(null);
  }, [tableId]);

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
    if (Number.isInteger(persistedBuyInCents) && Number(persistedBuyInCents) > 0) return Number(persistedBuyInCents);
    const table = lobbyTables.map((t) => normalizeTable(t as Record<string, unknown>)).find((t) => t.id === tableId);
    const min = table?.minBuyInCents;
    return min && min > 0 ? min : undefined;
  }, [routeBuyInCents, joinState?.buyInCents, persistedBuyInCents, lobbyTables, tableId]);

  const realtimeRoomId = useMemo(() => {
    if (persistedRoomId && persistedRoomId.length > 0) return persistedRoomId;
    const byRoomId = lobbyTables.find((t) => String((t as any)?.roomId ?? "") === tableId);
    if (byRoomId) return tableId;
    const byTableId = lobbyTables.find((t) => String((t as any)?.tableId ?? "") === tableId);
    const mappedRoomId = (byTableId as any)?.roomId;
    if (typeof mappedRoomId === "string" && mappedRoomId.length > 0) return mappedRoomId;
    return tableId;
  }, [persistedRoomId, lobbyTables, tableId]);

  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const shouldConnectRealtime = authHydrated && Boolean(authToken) && Boolean(tableId);
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
    enabled: shouldConnectRealtime,
    onError: (message) => {
      console.log("TABLE_REALTIME_ERROR", message);
    },
  });

  const sendAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
       
      console.log("[TABLE_ACTION_SEND]", { tableId, action, amountCents: payload.amount });
      const ok = dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (!ok) {
         
        console.log("TABLE_ACTION_FALLBACK", { action, tableId, reason: "sender-not-registered-or-invalid-payload" });
      }
    },
    [tableId, dispatchTableAction]
  );

  const ADD_BOT_PENDING_MS = 2500;
  const handleAddBot = useCallback(() => {
    setAddBotPending(true);
    if (addBotTimeoutRef.current) clearTimeout(addBotTimeoutRef.current);
    dispatchAddBot({ tableId, buyInCents: buyInCents ?? 0 });
    addBotTimeoutRef.current = setTimeout(() => {
      addBotTimeoutRef.current = null;
      setAddBotPending(false);
    }, ADD_BOT_PENDING_MS);
  }, [tableId, buyInCents, dispatchAddBot]);

  const prevSeatCountRef = useRef(0);
  const prevHadHandRef = useRef(false);
  useEffect(() => {
    if (!snapshot) return;
    const seatCount = snapshot.seats?.length ?? 0;
    const hasHand = Boolean(snapshot.hand);
    const prevSeatCount = prevSeatCountRef.current;
    const prevHadHand = prevHadHandRef.current;
    prevSeatCountRef.current = seatCount;
    prevHadHandRef.current = hasHand;
    if (addBotPending && (seatCount > prevSeatCount || (hasHand && !prevHadHand))) {
      if (addBotTimeoutRef.current) {
        clearTimeout(addBotTimeoutRef.current);
        addBotTimeoutRef.current = null;
      }
      setAddBotPending(false);
    }
  }, [addBotPending, snapshot]);

  useEffect(() => () => {
    if (addBotTimeoutRef.current) clearTimeout(addBotTimeoutRef.current);
  }, []);

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

  useEffect(() => {
    const hand = snapshot?.hand;
    const action = snapshot?.lastAction;
    if (!hand || !action) {
      if (!hand) setActionMessage(null);
      return;
    }

    const key = `${action.handId}:${action.seq}`;
    if (key === lastShownActionKey) return;
    setLastShownActionKey(key);

    const actorName = snapshot.seats.find((s) => s.userId === action.actorUserId)?.name
      ?? (action.actorKind === "BOT" ? "Bot" : "Player");
    setActionMessage(buildActionMessage(action, actorName));
  }, [snapshot?.hand, snapshot?.lastAction, snapshot?.seats, lastShownActionKey]);

  useEffect(() => {
    const activeHandId = snapshot?.hand?.handId;
    const resultHandId = snapshot?.lastHandResult?.handId;
    if (!activeHandId || !handResultMessage) return;
    if (activeHandId !== resultHandId) {
      setHandResultMessage(null);
    }
  }, [snapshot?.hand?.handId, snapshot?.lastHandResult?.handId, handResultMessage]);

  useEffect(() => {
    if (!snapshot?.hero.youAreSeated || snapshot.hero.seat == null) return;
    const heroSeat = snapshot.seats.find((seat) => seat.seat === snapshot.hero.seat);
    if (!heroSeat) return;
    const activeOrLastHandId = snapshot.hand?.handId ?? snapshot.lastHandResult?.handId ?? "no-hand";
    const shouldNotify = heroSeat.stackCents <= 0 && (heroSeat.status === "OUT" || heroSeat.status === "ABANDONED");
    if (!shouldNotify) return;
    if (outOfChipsNoticeShownForHandId === activeOrLastHandId) return;
    setOutOfChipsNoticeShownForHandId(activeOrLastHandId);
    useToastStore.getState().show("You are out of chips and sitting out. Add chips to continue.", "danger");
  }, [snapshot, outOfChipsNoticeShownForHandId]);

  useEffect(() => {
    if (!tableError) return;
    if (/INSUFFICIENT_BANKROLL|Insufficient bankroll/i.test(tableError)) {
      useToastStore.getState().show("Insufficient bankroll for this table. Deposit or choose a lower buy-in.", "danger");
      return;
    }
    useToastStore.getState().show(tableError, "danger");
  }, [tableError]);

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
        <View className="flex-1">
          <TableTopBar
            balanceCents={balanceCents}
            left={<Button variant="ghost" title="<" onPress={() => router.back()} />}
            right={
              <View className="ui-row ui-inline-1">
                {canDeleteTable ? (
                  <Button variant="ghost" title="Delete table" onPress={handleDeleteTable} />
                ) : null}
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
          />
          <ConnectingTableShell
            message={
              !hasValidBuyIn
                ? "Missing buy-in data."
                : tableError
                  ? tableError
                  : tableStatus === "DISCONNECTED"
                    ? "Connection lost. Attempting to reconnect..."
                    : tableStatus === "RECONNECTING"
                      ? "Reconnecting to table..."
                      : `Connecting to table (${tableStatus})...`
            }
            action={
              <Button variant="ghost" title="Return to lobby" onPress={() => router.replace(lobbyPath())} />
            }
          />
        </View>
      ) : !hasActiveHand ? (
        <EmptyTableView
          snapshot={snapshot!}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          handResultMessage={handResultMessage ?? undefined}
          topBarLeft={<Button variant="ghost" title="<" onPress={() => router.back()} />}
          topBarRight={
            <View className="ui-row ui-inline-1">
              {canDeleteTable ? (
                <Button variant="ghost" title="Delete table" onPress={handleDeleteTable} />
              ) : null}
              {snapshot?.hero.youAreSeated && buyInCents ? (
                <Button
                  variant="ghost"
                  title="+ Bot"
                  onPress={handleAddBot}
                  loading={addBotPending}
                />
              ) : null}
              <IconButton icon={<Icon name="chat" />} onPress={() => setChatVisible(true)} badge={unseenChatCount || undefined} />
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
          onPlayerPress={(o) => {
            if (o.isBot) {
              dispatchRemoveBot({ tableId, botId: o.id });
            } else {
              setPlayerPopup({ name: o.name, vpip: 42, pfr: 18, hands: 150, joinDate: "2024-01-15", location: "US" });
            }
          }}
          onAddBot={snapshot?.hero.youAreSeated && buyInCents ? handleAddBot : undefined}
          onReturnToLobby={() => router.replace(lobbyPath())}
          addBotPending={addBotPending}
        />
      ) : (
        <TableLayout
          snapshot={snapshot!}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus={tableStatus}
          connectionStatus={tableStatus}
          actionMessage={actionMessage ?? undefined}
          handResultMessage={handResultMessage ?? undefined}
          topBarLeft={<Button variant="ghost" title="<" onPress={() => router.back()} />}
          topBarRight={
            <View className="ui-row ui-inline-1">
              {canDeleteTable ? (
                <Button variant="ghost" title="Delete table" onPress={handleDeleteTable} />
              ) : null}
              {snapshot?.hero.youAreSeated && buyInCents ? (
                <Button
                  variant="ghost"
                  title="+ Bot"
                  onPress={handleAddBot}
                  loading={addBotPending}
                />
              ) : null}
              <IconButton icon={<Icon name="chat" />} onPress={() => setChatVisible(true)} badge={unseenChatCount || undefined} />
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
      <ChatOverlay
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        messages={chatMessagesForOverlay}
        onSend={(text) => dispatchSendChat({ tableId, text })}
      />
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
