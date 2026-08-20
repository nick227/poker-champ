import { useShallow } from "zustand/react/shallow";
import { storeRegistry } from "@/registry/store.registry";

/**
 * Batched store selectors for the table screen. One subscription per store with
 * shallow equality so we re-render only when the selected slice actually changes.
 * Lives in src/hooks (orchestration) so it can use storeRegistry; table domain
 * components receive data via props from the route that uses this hook.
 */
export function useTablePageStores(tableId: string | undefined) {
  const id = tableId ?? "";
  type TablesState = ReturnType<typeof storeRegistry.tables>;
  type LobbyState = ReturnType<typeof storeRegistry.lobby>;
  type TableState = ReturnType<typeof storeRegistry.table>;
  type AuthState = ReturnType<typeof storeRegistry.auth>;

  const tablesSlice = storeRegistry.use.tables(
    useShallow((s: TablesState) => ({
      openTableIds: s.openTableIds,
      activeTableId: s.activeTableId,
      openTable: s.openTable,
      closeTable: s.closeTable,
      setActive: s.setActive,
      persistedRoomId: id ? s.roomIdByTableId[id] : undefined,
      persistedBuyInCents: id ? s.lastBuyInCentsByTableId[id] : undefined,
      dispatchTableAction: s.dispatchTableAction,
      dispatchSendChat: s.dispatchSendChat,
      dispatchSendGift: s.dispatchSendGift,
      dispatchProposeSideBet: s.dispatchProposeSideBet,
      dispatchRespondSideBet: s.dispatchRespondSideBet,
      dispatchCancelSideBet: s.dispatchCancelSideBet,
      dispatchListBots: s.dispatchListBots,
      dispatchRejoin: s.dispatchRejoin,
      dispatchJoinTable: s.dispatchJoinTable,
      dispatchAddBot: s.dispatchAddBot,
      dispatchRemoveBot: s.dispatchRemoveBot,
      dispatchSetSittingOut: s.dispatchSetSittingOut,
      joinState: id ? s.tableJoinById[id] : undefined,
      pendingActionForTable: id ? s.pendingActionByTableId[id] : undefined,
    }))
  );

  const lobbyTables = storeRegistry.use.lobby(useShallow((s: LobbyState) => s.tables));

  const tableSlice = storeRegistry.use.table(
    useShallow((s: TableState) => ({
      snapshotsByTableId: s.snapshotsByTableId,
      chatMessagesForTable: id ? (s.chatMessagesByTableId[id] ?? []) : [],
      giftFeedForTable: id ? (s.giftFeedByTableId[id] ?? []) : [],
      sideBetsForTable: id ? (s.sideBetsByTableId[id] ?? {}) : {},
      botSummariesForTable: id ? (s.botSummariesByTableId[id] ?? []) : [],
      botSummariesUpdatedAtForTable: id ? s.botSummariesUpdatedAtByTableId[id] : undefined,
      connectionStatusForTable: id ? s.connectionStatusByTableId[id] : undefined,
      errorForTable: id ? s.errorByTableId[id] : undefined,
      loadSignalsForTable: id ? s.loadSignalsByTableId[id] : undefined,
      lastSeqForTable: id ? s.lastSeqByTableId[id] : undefined,
    }))
  );

  const authSlice = storeRegistry.use.auth(
    useShallow((s: AuthState) => ({
      hydrated: s.hydrated,
      token: s.token,
    }))
  );

  return {
    ...tablesSlice,
    lobbyTables,
    ...tableSlice,
    ...authSlice,
  };
}

