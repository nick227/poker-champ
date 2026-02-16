import { create } from "zustand";
import type { TableActionKey } from "@/registry/table-action.registry";
import { toServerActionPayload } from "@/realtime/action.mapper";
import { isValidTableInbound } from "@/realtime/contract.guards";

type RealtimeSender = (type: string, payload?: unknown) => boolean;

type MultiTableState = {
  openTableIds: string[];
  activeTableId: string | null;
  tableSenders: Record<string, RealtimeSender>;
  openTable: (id: string) => void;
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
  openTable: (id) =>
    set((s) => {
      const exists = s.openTableIds.includes(id);
      const open = exists
        ? [id, ...s.openTableIds.filter((x) => x !== id)]
        : [id, ...s.openTableIds].slice(0, 8);
      return { openTableIds: open, activeTableId: id };
    }),
  closeTable: (id) =>
    set((s) => {
      const open = s.openTableIds.filter((x) => x !== id);
      const active = s.activeTableId === id ? open[0] ?? null : s.activeTableId;
      const { [id]: _, ...restSenders } = s.tableSenders;
      return { openTableIds: open, activeTableId: active, tableSenders: restSenders };
    }),
  setActive: (id) => set({ activeTableId: id }),
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
  closeAll: () => set({ openTableIds: [], activeTableId: null, tableSenders: {} }),
}));
