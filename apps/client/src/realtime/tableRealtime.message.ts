import type { TableSnapshotPayload, ChatMessagePayload, BotSummary } from "@poker-champ/realtime-contract";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";

type TableLifecycleStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

export type TableRealtimeMessageHandlerDeps = {
  setRoomForTable: (tableId: string, roomId: string) => void;
  resetSnapshotStream: (tableId: string) => void;
  setSnapshot: (tableId: string, snapshot: TableSnapshotPayload) => void;
  appendChatMessage: (tableId: string, message: ChatMessagePayload) => void;
  setBotSummaries: (tableId: string, bots: BotSummary[]) => void;
  setConnectionStatus: (tableId: string, status: Exclude<TableLifecycleStatus, "DISCONNECTED">) => void;
  clearConnectionStatus: (tableId: string) => void;
  setError: (tableId: string, error: string) => void;
  onError?: (message: string) => void;
  onTableGone?: (tableId: string) => void;
  debugLog: (...args: unknown[]) => void;
};

type TableRealtimeInboundMessage = {
  tableId: string;
  type: string;
  payload: unknown;
  deps: TableRealtimeMessageHandlerDeps;
};

export function handleTableRealtimeInboundMessage({ tableId, type, payload, deps }: TableRealtimeInboundMessage): void {
  if (type === "WELCOME") {
    const p = payload as { roomId?: string; joinMode?: "NEW" | "RESTORE" } | undefined;
    if (typeof p?.roomId === "string" && p.roomId.length > 0) {
      deps.setRoomForTable(tableId, p.roomId);
    }
    if (p?.joinMode === "NEW") {
      deps.resetSnapshotStream(tableId);
    }
  }
  if (type === "SESSION_RESTORED") {
    // A restored session may resume from a different snapshot stream cursor.
    // Reset local cursor so the first post-restore snapshot is always accepted.
    deps.resetSnapshotStream(tableId);
  }
  if (type === "TABLE_SNAPSHOT") {
    const snap = payload as
      | { hand?: { handId?: string; street?: string }; reason?: string; actionId?: string; version?: number; snapshotSeq?: number }
      | undefined;
    deps.debugLog("INBOUND", {
      tableId,
      type,
      reason: snap?.reason,
      handId: snap?.hand?.handId,
      street: snap?.hand?.street,
      actionId: snap?.actionId,
      version: snap?.version,
      snapshotSeq: snap?.snapshotSeq,
    });

    if (snap?.actionId) {
      storeRegistry.tables().clearPendingActionIfMatch(tableId, snap.actionId);
      console.log(`[TABLE_RT] Action completed: ${snap.actionId} for table ${tableId}`);
    }
  } else if (type === "ERROR") {
    const p = payload as { code?: string; message?: string; actionId?: string; retryAfterSeconds?: number };
    deps.debugLog("INBOUND", { tableId, type, code: p?.code, message: p?.message, actionId: p?.actionId });

    if (p?.code === "TABLE_GONE") {
      storeRegistry.tables().clearPendingAction(tableId);
      deps.onTableGone?.(tableId);
      if (!deps.onTableGone) deps.setError(tableId, p?.message ?? "Table no longer exists");
      return;
    }
    if (p?.code === "QUEUE_FULL" || p?.code === "RATE_LIMITED") {
      storeRegistry.tables().scheduleActionRetry(tableId, p?.retryAfterSeconds ?? 2);
      return;
    }
    storeRegistry.tables().clearPendingAction(tableId);
    if (p?.actionId) {
      console.error(`[TABLE_RT] Action failed: ${p.actionId} for table ${tableId}`, p.message || p.code);
    }
  } else if (
    type === "WELCOME" ||
    type === "SESSION_RESTORED" ||
    type === "RECONNECTING" ||
    type === "DISCONNECTED" ||
    type === "CONNECTED"
  ) {
    deps.debugLog("INBOUND", { tableId, type, payload });
  }

  dispatchRealtimeChannelMessage("table", type, payload, {
    tableId,
    onSnapshot: (targetTableId, snapshot) => {
      deps.setSnapshot(targetTableId, snapshot);
    },
    appendChatMessage: (targetTableId, message) => {
      deps.appendChatMessage(targetTableId, message);
    },
    onBotsList: (targetTableId, bots) => {
      deps.setBotSummaries(targetTableId, bots);
    },
    setStatus: (status) => {
      if (status === "DISCONNECTED") deps.clearConnectionStatus(tableId);
      else deps.setConnectionStatus(tableId, status as Exclude<TableLifecycleStatus, "DISCONNECTED">);
      deps.debugLog("STATUS", { tableId, status });
    },
    onError: (message) => {
      deps.setError(tableId, message);
      deps.debugLog("ERROR", { tableId, message });
      deps.onError?.(message);
    },
  });
}
