import { useShallow } from "zustand/react/shallow";
import { storeRegistry } from "@/registry/store.registry";

/**
 * Batched store selectors for the table screen. One subscription per store with
 * shallow equality so we re-render only when the selected slice actually changes.
 * Lives in src/hooks (orchestration) so it can use storeRegistry; table domain
 * components receive data via props from the route that uses this hook.
 */
export function useTableScreenStores(tableId: string | undefined) {
  const id = tableId ?? "";

  const tablesSlice = storeRegistry.use.tables(
    useShallow((s) => ({
      openTableIds: s.openTableIds,
      activeTableId: s.activeTableId,
      openTable: s.openTable,
      closeTable: s.closeTable,
      setActive: s.setActive,
      persistedRoomId: id ? s.roomIdByTableId[id] : undefined,
      persistedBuyInCents: id ? s.lastBuyInCentsByTableId[id] : undefined,
      dispatchTableAction: s.dispatchTableAction,
      dispatchSendChat: s.dispatchSendChat,
      dispatchListBots: s.dispatchListBots,
      dispatchAddBot: s.dispatchAddBot,
      dispatchRemoveBot: s.dispatchRemoveBot,
      joinState: id ? s.tableJoinById[id] : undefined,
    }))
  );

  const lobbyTables = storeRegistry.use.lobby(useShallow((s) => s.tables));

  const tableSlice = storeRegistry.use.table(
    useShallow((s) => ({
      snapshotsByTableId: s.snapshotsByTableId,
      chatMessagesForTable: id ? (s.chatMessagesByTableId[id] ?? []) : [],
      botSummariesForTable: id ? (s.botSummariesByTableId[id] ?? []) : [],
      botSummariesUpdatedAtForTable: id ? s.botSummariesUpdatedAtByTableId[id] : undefined,
      connectionStatusForTable: id ? s.connectionStatusByTableId[id] : undefined,
      errorForTable: id ? s.errorByTableId[id] : undefined,
    }))
  );

  const authSlice = storeRegistry.use.auth(
    useShallow((s) => ({
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
