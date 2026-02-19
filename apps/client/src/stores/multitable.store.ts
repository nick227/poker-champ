import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { TableActionKey } from "@/registry/table-action.registry";
import { toServerActionPayload } from "@/realtime/action.mapper";
import { isValidTableInbound } from "@/realtime/contract.guards";

type RealtimeSender = (type: string, payload?: unknown) => boolean;
type TableJoinState = { buyInCents?: number; password?: string };
const TTL_MS = 24 * 60 * 60 * 1000;

const memoryStorage = new Map<string, string>();
const fallbackStorage: StateStorage = {
  getItem: (name) => memoryStorage.get(name) ?? null,
  setItem: (name, value) => {
    memoryStorage.set(name, value);
  },
  removeItem: (name) => {
    memoryStorage.delete(name);
  },
};
const webLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

type MultiTableState = {
  openTableIds: string[];
  activeTableId: string | null;
  tableSenders: Record<string, RealtimeSender>;
  tableJoinById: Record<string, TableJoinState>;
  roomIdByTableId: Record<string, string>;
  lastBuyInCentsByTableId: Record<string, number>;
  tableMetaUpdatedAt: Record<string, number>;
  openTable: (id: string, joinState?: TableJoinState) => void;
  closeTable: (id: string) => void;
  setActive: (id: string) => void;
  setRoomForTable: (tableId: string, roomId: string) => void;
  setLastBuyIn: (tableId: string, buyInCents: number) => void;
  pruneExpiredTables: () => void;
  registerTableSender: (id: string, sender: RealtimeSender) => void;
  unregisterTableSender: (id: string) => void;
  dispatchTableAction: (input: { tableId: string; action: TableActionKey; amountCents?: number }) => boolean;
  dispatchSendChat: (input: { tableId: string; text: string }) => boolean;
  dispatchAddBot: (input: { tableId: string; name?: string; buyInCents: number }) => boolean;
  dispatchRemoveBot: (input: { tableId: string; botId: string }) => boolean;
  closeAll: () => void;
};

export const useMultiTableStore = create<MultiTableState>()(
  persist(
    (set, get) => ({
      openTableIds: [],
      activeTableId: null,
      tableSenders: {},
      tableJoinById: {},
      roomIdByTableId: {},
      lastBuyInCentsByTableId: {},
      tableMetaUpdatedAt: {},
      openTable: (id, joinState) =>
        set((s) => {
          const exists = s.openTableIds.includes(id);
          const isAlreadyFront = exists && s.openTableIds[0] === id;

          const prevJoin = s.tableJoinById[id];
          const nextJoin = joinState ? { ...prevJoin, ...joinState } : prevJoin;
          const joinChanged =
            Boolean(joinState) &&
            (nextJoin?.buyInCents !== prevJoin?.buyInCents || nextJoin?.password !== prevJoin?.password);

          const open = exists
            ? (isAlreadyFront ? s.openTableIds : [id, ...s.openTableIds.filter((x) => x !== id)])
            : [id, ...s.openTableIds].slice(0, 8);

          const activeChanged = s.activeTableId !== id;
          const openChanged = open !== s.openTableIds;
          if (!openChanged && !activeChanged && !joinChanged) return s;

          const nextLastBuyIn =
            Number.isInteger(nextJoin?.buyInCents) && Number(nextJoin?.buyInCents) > 0
              ? {
                  ...s.lastBuyInCentsByTableId,
                  [id]: Number(nextJoin?.buyInCents),
                }
              : s.lastBuyInCentsByTableId;
          const nextUpdatedAt =
            nextLastBuyIn !== s.lastBuyInCentsByTableId
              ? {
                  ...s.tableMetaUpdatedAt,
                  [id]: Date.now(),
                }
              : s.tableMetaUpdatedAt;

          return {
            openTableIds: open,
            activeTableId: id,
            tableJoinById: joinState
              ? {
                  ...s.tableJoinById,
                  [id]: nextJoin ?? {},
                }
              : s.tableJoinById,
            lastBuyInCentsByTableId: nextLastBuyIn,
            tableMetaUpdatedAt: nextUpdatedAt,
          };
        }),
      closeTable: (id) =>
        set((s) => {
          const open = s.openTableIds.filter((x) => x !== id);
          const active = s.activeTableId === id ? open[0] ?? null : s.activeTableId;
          const { [id]: _, ...restSenders } = s.tableSenders;
          const { [id]: __, ...restJoin } = s.tableJoinById;
          const { [id]: ___, ...restRoomId } = s.roomIdByTableId;
          const { [id]: ____, ...restBuyIn } = s.lastBuyInCentsByTableId;
          const { [id]: _____, ...restUpdatedAt } = s.tableMetaUpdatedAt;
          return {
            openTableIds: open,
            activeTableId: active,
            tableSenders: restSenders,
            tableJoinById: restJoin,
            roomIdByTableId: restRoomId,
            lastBuyInCentsByTableId: restBuyIn,
            tableMetaUpdatedAt: restUpdatedAt,
          };
        }),
      setActive: (id) =>
        set((s) => {
          if (s.activeTableId === id) return s;
          return { activeTableId: id };
        }),
      setRoomForTable: (tableId, roomId) =>
        set((s) => ({
          roomIdByTableId: {
            ...s.roomIdByTableId,
            [tableId]: roomId,
          },
          tableMetaUpdatedAt: {
            ...s.tableMetaUpdatedAt,
            [tableId]: Date.now(),
          },
        })),
      setLastBuyIn: (tableId, buyInCents) =>
        set((s) => ({
          lastBuyInCentsByTableId: {
            ...s.lastBuyInCentsByTableId,
            [tableId]: buyInCents,
          },
          tableMetaUpdatedAt: {
            ...s.tableMetaUpdatedAt,
            [tableId]: Date.now(),
          },
        })),
      pruneExpiredTables: () =>
        set((s) => {
          const now = Date.now();
          const roomIdByTableId = { ...s.roomIdByTableId };
          const lastBuyInCentsByTableId = { ...s.lastBuyInCentsByTableId };
          const tableMetaUpdatedAt = { ...s.tableMetaUpdatedAt };

          for (const [tableId, ts] of Object.entries(tableMetaUpdatedAt)) {
            if (now - ts > TTL_MS) {
              delete roomIdByTableId[tableId];
              delete lastBuyInCentsByTableId[tableId];
              delete tableMetaUpdatedAt[tableId];
            }
          }

          return { roomIdByTableId, lastBuyInCentsByTableId, tableMetaUpdatedAt };
        }),
      registerTableSender: (id, sender) =>
        set((s) => ({
          tableSenders: {
            ...s.tableSenders,
            [id]: sender,
          },
        })),
      unregisterTableSender: (id) =>
        set((s) => {
          const { [id]: _, ...restSenders } = s.tableSenders;
          return { tableSenders: restSenders };
        }),
      dispatchTableAction: ({ tableId, action, amountCents }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        const payload = toServerActionPayload({ action, amountCents });
        if (!isValidTableInbound("ACTION", payload)) return false;
        return sender("ACTION", payload);
      },
      dispatchSendChat: ({ tableId, text }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        const trimmed = text.trim();
        if (!trimmed) return false;
        if (trimmed.length > 500) return false;
        const payload = { text: trimmed };
        if (!isValidTableInbound("CHAT", payload)) return false;
        return sender("CHAT", payload);
      },
      dispatchAddBot: ({ tableId, name = "Bot", buyInCents }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        return sender("ADD_BOT", { name, buyInCents });
      },
      dispatchRemoveBot: ({ tableId, botId }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        return sender("REMOVE_BOT", { botId });
      },
      closeAll: () =>
        set({
          openTableIds: [],
          activeTableId: null,
          tableSenders: {},
          tableJoinById: {},
          roomIdByTableId: {},
          lastBuyInCentsByTableId: {},
          tableMetaUpdatedAt: {},
        }),
    }),
    {
      name: "multitable-store",
      storage: createJSONStorage(() => (webLocalStorage ?? fallbackStorage)),
      partialize: (state) => ({
        tableJoinById: state.tableJoinById,
        roomIdByTableId: state.roomIdByTableId,
        lastBuyInCentsByTableId: state.lastBuyInCentsByTableId,
        tableMetaUpdatedAt: state.tableMetaUpdatedAt,
      }),
    },
  ),
);
