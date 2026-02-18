import { create } from "zustand";
import type { TableSnapshotPayload, ChatMessagePayload } from "@poker-champ/realtime-contract";

const CHAT_MESSAGES_CAP = 100;

type TableStoreState = {
  snapshotsByTableId: Record<string, TableSnapshotPayload | undefined>;
  chatMessagesByTableId: Record<string, ChatMessagePayload[]>;
  lastSeqByTableId: Record<string, number>;
  connectionStatusByTableId: Record<string, "CONNECTED" | "RECONNECTING" | "DISCONNECTED">;
  statusByTableId: Record<string, string | undefined>;
  errorByTableId: Record<string, string | undefined>;
  setSnapshot: (tableId: string, snapshot: TableSnapshotPayload) => void;
  appendChatMessage: (tableId: string, message: ChatMessagePayload) => void;
  setConnectionStatus: (tableId: string, status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED") => void;
  setStatus: (tableId: string, status: string) => void;
  setError: (tableId: string, error: string) => void;
  clearTable: (tableId: string) => void;
};

export const useTableStore = create<TableStoreState>((set) => ({
  snapshotsByTableId: {},
  chatMessagesByTableId: {},
  lastSeqByTableId: {},
  connectionStatusByTableId: {},
  statusByTableId: {},
  errorByTableId: {},
  appendChatMessage: (tableId, message) =>
    set((s) => {
      const list = s.chatMessagesByTableId[tableId] ?? [];
      if (list.some((m) => m.id === message.id)) return s;
      const next = [...list, message].slice(-CHAT_MESSAGES_CAP);
      return { chatMessagesByTableId: { ...s.chatMessagesByTableId, [tableId]: next } };
    }),
  setSnapshot: (tableId, snapshot) =>
    set((s) => {
      const lastSeq = s.lastSeqByTableId[tableId] || 0;
      if (snapshot.snapshotSeq <= lastSeq) {
        // Drop outdated snapshot
        console.warn(`[TableStore] Dropping outdated snapshot for table ${tableId}: seq ${snapshot.snapshotSeq} <= last ${lastSeq}`);
        return s;
      }
      
      return {
        snapshotsByTableId: {
          ...s.snapshotsByTableId,
          [tableId]: snapshot,
        },
        lastSeqByTableId: {
          ...s.lastSeqByTableId,
          [tableId]: snapshot.snapshotSeq,
        },
        errorByTableId: {
          ...s.errorByTableId,
          [tableId]: undefined,
        },
      };
    }),
  setStatus: (tableId, status) =>
    set((s) => ({
      statusByTableId: {
        ...s.statusByTableId,
        [tableId]: status,
      },
    })),
  setConnectionStatus: (tableId, status) =>
    set((s) => ({
      connectionStatusByTableId: {
        ...s.connectionStatusByTableId,
        [tableId]: status,
      },
    })),
  setError: (tableId, error) =>
    set((s) => ({
      errorByTableId: {
        ...s.errorByTableId,
        [tableId]: error,
      },
    })),
  clearTable: (tableId) =>
    set((s) => {
      const { [tableId]: _snapshot, ...snapshotsByTableId } = s.snapshotsByTableId;
      const { [tableId]: _chat, ...chatMessagesByTableId } = s.chatMessagesByTableId;
      const { [tableId]: _status, ...statusByTableId } = s.statusByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      const { [tableId]: _lastSeq, ...lastSeqByTableId } = s.lastSeqByTableId;
      const { [tableId]: _connectionStatus, ...connectionStatusByTableId } = s.connectionStatusByTableId;
      return { snapshotsByTableId, chatMessagesByTableId, statusByTableId, errorByTableId, lastSeqByTableId, connectionStatusByTableId };
    }),
}));

