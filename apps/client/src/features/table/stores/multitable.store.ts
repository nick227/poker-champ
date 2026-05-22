import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { TableActionKey } from "@/registry/table-action.registry";
import { toServerActionPayload } from "@/realtime/action.mapper";
import { isValidTableInbound } from "@/realtime/contract.guards";
import { useTableStore } from "@/features/table/stores/table.store";

type RealtimeSender = (type: string, payload?: unknown) => boolean;
type TableJoinState = { buyInCents?: number; password?: string };

export type PendingAction = {
  actionId: string;
  payload: ReturnType<typeof toServerActionPayload>;
  retriesLeft: number;
  createdAtTs: number;
  /** Street when the action was sent; used to ack when betting round advances. */
  dispatchHandStreet: string | null;
};
const TTL_MS = 24 * 60 * 60 * 1000;

function hasActionId(payload: unknown): payload is { actionId: string } {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { actionId?: unknown };
  return typeof candidate.actionId === "string" && candidate.actionId.length > 0;
}

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
interface HasLocalStorage {
  localStorage?: StateStorage;
}
const webLocalStorage = typeof globalThis !== "undefined" && "localStorage" in globalThis ? (globalThis as HasLocalStorage).localStorage : undefined;

type MultiTableState = {
  openTableIds: string[];
  activeTableId: string | null;
  tableSenders: Record<string, RealtimeSender>;
  pendingActionByTableId: Record<string, PendingAction | undefined>;
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
  dispatchListBots: (input: { tableId: string }) => boolean;
  dispatchRejoin: (input: { tableId: string }) => boolean;
  dispatchJoinTable: (input: { tableId: string; buyInCents: number }) => boolean;
  dispatchAddBot: (input: { tableId: string; botId?: string; name?: string; buyInCents: number }) => boolean;
  dispatchRemoveBot: (input: { tableId: string; botId: string }) => boolean;
  dispatchSetSittingOut: (input: { tableId: string; sittingOut: boolean }) => boolean;
  closeAll: () => void;
  scheduleActionRetry: (tableId: string, retryAfterSeconds?: number) => void;
  clearPendingAction: (tableId: string) => void;
  clearPendingActionIfMatch: (tableId: string, actionId?: string) => void;
  registerTableDisconnect: (tableId: string, disconnect: (consented?: boolean) => void) => void;
  unregisterTableDisconnect: (tableId: string) => void;
  disconnectOtherTables: (exceptTableId: string) => void;
};

const tableDisconnectByTableId = new Map<string, (consented?: boolean) => void>();

export const useMultiTableStore = create<MultiTableState>()(
  persist(
    (set, get) => ({
      openTableIds: [],
      activeTableId: null,
      tableSenders: {},
      pendingActionByTableId: {},
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
          const { [id]: _s, ...restSenders } = s.tableSenders;
          const { [id]: _p, ...restPending } = s.pendingActionByTableId;
          const { [id]: __, ...restJoin } = s.tableJoinById;
          const { [id]: ___, ...restRoomId } = s.roomIdByTableId;
          const { [id]: ____, ...restBuyIn } = s.lastBuyInCentsByTableId;
          const { [id]: _____, ...restUpdatedAt } = s.tableMetaUpdatedAt;
          return {
            openTableIds: open,
            activeTableId: active,
            tableSenders: restSenders,
            pendingActionByTableId: restPending,
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
        if (get().pendingActionByTableId[tableId]) return false;
        const payload = toServerActionPayload({ action, amountCents });
        if (!isValidTableInbound("ACTION", payload)) return false;
        const dispatchHandStreet =
          useTableStore.getState().snapshotsByTableId[tableId]?.hand?.street ?? null;
        set((s) => ({
          pendingActionByTableId: {
            ...s.pendingActionByTableId,
            [tableId]: {
              actionId: payload.actionId,
              payload,
              retriesLeft: 3,
              createdAtTs: Date.now(),
              dispatchHandStreet,
            },
          },
        }));
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
      dispatchListBots: ({ tableId }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        return sender("LIST_BOTS", {});
      },
      dispatchRejoin: ({ tableId }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        const payload = {};
        if (!isValidTableInbound("REJOIN", payload)) return false;
        return sender("REJOIN", payload);
      },
      dispatchJoinTable: ({ tableId, buyInCents }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        const payload = { buyInCents };
        if (!isValidTableInbound("JOIN_TABLE", payload)) return false;
        return sender("JOIN_TABLE", payload);
      },
      dispatchAddBot: ({ tableId, botId, name = "Bot", buyInCents }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        return sender("ADD_BOT", { botId, name, buyInCents });
      },
      dispatchRemoveBot: ({ tableId, botId }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        return sender("REMOVE_BOT", { botId });
      },
      dispatchSetSittingOut: ({ tableId, sittingOut }): boolean => {
        const sender = get().tableSenders[tableId];
        if (!sender) return false;
        const payload = { sittingOut };
        if (!isValidTableInbound("SET_SITTING_OUT", payload)) return false;
        return sender("SET_SITTING_OUT", payload);
      },
      scheduleActionRetry: (tableId, retryAfterSeconds = 2) => {
        const pending = get().pendingActionByTableId[tableId];
        if (!pending || pending.retriesLeft <= 0) return;
        const baseMs = retryAfterSeconds * 1000;
        const jitter = 0.5 + Math.random();
        const delayMs = Math.round(baseMs * jitter);
        set((s) => ({
          pendingActionByTableId: {
            ...s.pendingActionByTableId,
            [tableId]: { ...pending, retriesLeft: pending.retriesLeft - 1 },
          },
        }));
        setTimeout(() => {
          const sender = get().tableSenders[tableId];
          const p = get().pendingActionByTableId[tableId];
          if (!sender || !p) return;
          if (!hasActionId(p.payload) || !isValidTableInbound("ACTION", p.payload)) {
            const { [tableId]: _, ...rest } = get().pendingActionByTableId;
            set({ pendingActionByTableId: rest });
            return;
          }
          sender("ACTION", p.payload);
        }, delayMs);
      },
      clearPendingAction: (tableId) =>
        set((s) => {
          const { [tableId]: _, ...rest } = s.pendingActionByTableId;
          return { pendingActionByTableId: rest };
        }),
      clearPendingActionIfMatch: (tableId, actionId) =>
        set((s) => {
          const pending = s.pendingActionByTableId[tableId];
          if (!pending || (actionId != null && pending.actionId !== actionId)) return s;
          const { [tableId]: _, ...rest } = s.pendingActionByTableId;
          return { pendingActionByTableId: rest };
        }),
      closeAll: () =>
        set({
          openTableIds: [],
          activeTableId: null,
          tableSenders: {},
          pendingActionByTableId: {},
          tableJoinById: {},
          roomIdByTableId: {},
          lastBuyInCentsByTableId: {},
          tableMetaUpdatedAt: {},
        }),
      registerTableDisconnect: (tableId, disconnect) => {
        tableDisconnectByTableId.set(tableId, disconnect);
      },
      unregisterTableDisconnect: (tableId) => {
        tableDisconnectByTableId.delete(tableId);
      },
      disconnectOtherTables: (exceptTableId) => {
        for (const [id, fn] of tableDisconnectByTableId.entries()) {
          if (id !== exceptTableId) {
            try {
              fn(true);
            } catch {
              /* no-op */
            }
            tableDisconnectByTableId.delete(id);
          }
        }
      },
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
