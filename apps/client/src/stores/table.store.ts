import { create } from "zustand";
import type { TableSnapshotPayload, ChatMessagePayload, BotSummary } from "@poker-champ/realtime-contract";

const CHAT_MESSAGES_CAP = 100;

type TableStoreState = {
  snapshotsByTableId: Record<string, TableSnapshotPayload | undefined>;
  chatMessagesByTableId: Record<string, ChatMessagePayload[]>;
  botSummariesByTableId: Record<string, BotSummary[]>;
  botSummariesUpdatedAtByTableId: Record<string, number>;
  lastSeqByTableId: Record<string, number>;
  connectionStatusByTableId: Record<string, "CONNECTED" | "RECONNECTING" | "DISCONNECTED">;
  activeSessionIdByTableId: Record<string, string | undefined>;
  statusByTableId: Record<string, string | undefined>;
  errorByTableId: Record<string, string | undefined>;
  setSnapshot: (tableId: string, snapshot: TableSnapshotPayload) => void;
  resetSnapshotStream: (tableId: string) => void;
  appendChatMessage: (tableId: string, message: ChatMessagePayload) => void;
  setBotSummaries: (tableId: string, bots: BotSummary[]) => void;
  setConnectionStatus: (tableId: string, status: "CONNECTED" | "RECONNECTING" | "DISCONNECTED") => void;
  clearConnectionStatus: (tableId: string) => void;
  setActiveSessionId: (tableId: string, sessionId: string) => void;
  getActiveSessionId: (tableId: string) => string | undefined;
  clearActiveSessionId: (tableId: string) => void;
  setStatus: (tableId: string, status: string) => void;
  setError: (tableId: string, error: string) => void;
  clearTable: (tableId: string) => void;
};

export const useTableStore = create<TableStoreState>((set, get) => ({
  snapshotsByTableId: {},
  chatMessagesByTableId: {},
  botSummariesByTableId: {},
  botSummariesUpdatedAtByTableId: {},
  lastSeqByTableId: {},
  connectionStatusByTableId: {},
  activeSessionIdByTableId: {},
  statusByTableId: {},
  errorByTableId: {},
  appendChatMessage: (tableId, message) =>
    set((s) => {
      const list = s.chatMessagesByTableId[tableId] ?? [];
      if (list.some((m) => m.id === message.id)) return s;
      const next = [...list, message].slice(-CHAT_MESSAGES_CAP);
      return { chatMessagesByTableId: { ...s.chatMessagesByTableId, [tableId]: next } };
    }),
  setBotSummaries: (tableId, bots) =>
    set((s) => ({
      botSummariesByTableId: {
        ...s.botSummariesByTableId,
        [tableId]: bots,
      },
      botSummariesUpdatedAtByTableId: {
        ...s.botSummariesUpdatedAtByTableId,
        [tableId]: Date.now(),
      },
    })),
  setSnapshot: (tableId, snapshot) =>
    set((s) => {
      const lastSeq = s.lastSeqByTableId[tableId] || 0;
      const isStreamRestart = snapshot.snapshotSeq === 1 && lastSeq > 1;
      if (isStreamRestart) {
        console.warn(
          `[TableStore] Detected snapshot stream restart for table ${tableId}: incoming seq 1 after last ${lastSeq}. Resetting cursor.`,
        );
      }

      if (snapshot.snapshotSeq <= lastSeq) {
        if (isStreamRestart) {
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
        }
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
  resetSnapshotStream: (tableId) =>
    set((s) => {
      const { [tableId]: _snapshot, ...snapshotsByTableId } = s.snapshotsByTableId;
      const { [tableId]: _lastSeq, ...lastSeqByTableId } = s.lastSeqByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      return { snapshotsByTableId, lastSeqByTableId, errorByTableId };
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
  clearConnectionStatus: (tableId) =>
    set((s) => {
      const { [tableId]: _connectionStatus, ...connectionStatusByTableId } = s.connectionStatusByTableId;
      return { connectionStatusByTableId };
    }),
  setActiveSessionId: (tableId, sessionId) =>
    set((s) => ({
      activeSessionIdByTableId: { ...s.activeSessionIdByTableId, [tableId]: sessionId },
    })),
  getActiveSessionId: (tableId): string | undefined => get().activeSessionIdByTableId[tableId],
  clearActiveSessionId: (tableId) =>
    set((s) => {
      const { [tableId]: _, ...activeSessionIdByTableId } = s.activeSessionIdByTableId;
      return { activeSessionIdByTableId };
    }),
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
      const { [tableId]: _bots, ...botSummariesByTableId } = s.botSummariesByTableId;
      const { [tableId]: _botsAt, ...botSummariesUpdatedAtByTableId } = s.botSummariesUpdatedAtByTableId;
      const { [tableId]: _status, ...statusByTableId } = s.statusByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      const { [tableId]: _lastSeq, ...lastSeqByTableId } = s.lastSeqByTableId;
      const { [tableId]: _connectionStatus, ...connectionStatusByTableId } = s.connectionStatusByTableId;
      const { [tableId]: _activeSessionId, ...activeSessionIdByTableId } = s.activeSessionIdByTableId;
      return {
        snapshotsByTableId,
        chatMessagesByTableId,
        botSummariesByTableId,
        botSummariesUpdatedAtByTableId,
        statusByTableId,
        errorByTableId,
        lastSeqByTableId,
        connectionStatusByTableId,
        activeSessionIdByTableId,
      };
    }),
}));
