import { create } from "zustand";
import type { TableActionKey } from "@/registry/table-action.registry";
import { toServerActionPayload } from "@/realtime/action.mapper";
import { isValidTableInbound } from "@/realtime/contract.guards";

type RealtimeSender = (type: string, payload?: unknown) => boolean;
type TableJoinState = { buyInCents?: number; password?: string };

type MultiTableState = {
  openTableIds: string[];
  activeTableId: string | null;
  tableSenders: Record<string, RealtimeSender>;
  tableJoinById: Record<string, TableJoinState>;
  openTable: (id: string, joinState?: TableJoinState) => void;
  closeTable: (id: string) => void;
  setActive: (id: string) => void;
  registerTableSender: (id: string, sender: RealtimeSender) => void;
  unregisterTableSender: (id: string) => void;
  dispatchTableAction: (input: { tableId: string; action: TableActionKey; amountCents?: number }) => boolean;
  dispatchAddBot: (input: { tableId: string; name?: string; buyInCents: number }) => boolean;
  dispatchRemoveBot: (input: { tableId: string; botId: string }) => boolean;
  closeAll: () => void;
};

export const useMultiTableStore = create<MultiTableState>((set, get) => ({
  openTableIds: [],
  activeTableId: null,
  tableSenders: {},
  tableJoinById: {},
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

      return {
        openTableIds: open,
        activeTableId: id,
        tableJoinById: joinState
          ? {
              ...s.tableJoinById,
              [id]: nextJoin ?? {},
            }
          : s.tableJoinById,
      };
    }),
  closeTable: (id) =>
    set((s) => {
      const open = s.openTableIds.filter((x) => x !== id);
      const active = s.activeTableId === id ? open[0] ?? null : s.activeTableId;
      const { [id]: _, ...restSenders } = s.tableSenders;
      const { [id]: __, ...restJoin } = s.tableJoinById;
      return { openTableIds: open, activeTableId: active, tableSenders: restSenders, tableJoinById: restJoin };
    }),
  setActive: (id) =>
    set((s) => {
      if (s.activeTableId === id) return s;
      return { activeTableId: id };
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
  closeAll: () => set({ openTableIds: [], activeTableId: null, tableSenders: {}, tableJoinById: {} }),
}));
