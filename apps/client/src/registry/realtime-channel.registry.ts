import { isValidLobbyOutbound, isValidTableOutbound } from "@/realtime/contract.guards";
import type { TableSnapshotPayload, ChatMessagePayload } from "@poker-champ/realtime-contract";
import { storeRegistry } from "@/registry/store.registry";

export type RealtimeScope = "lobby" | "table";
export type TransportState = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

type LobbyMessageContext = {
  onError?: (message: string) => void;
  onSessionRestored?: (userId: string) => void;
  onTableList?: (tables: unknown[]) => void;
  onTransportState?: (state: TransportState) => void;
};

type TableMessageContext = {
  tableId?: string;
  setStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onSnapshot?: (tableId: string, snapshot: TableSnapshotPayload) => void;
};

type ScopeContextMap = {
  lobby: LobbyMessageContext;
  table: TableMessageContext;
};

type ScopeRegistryMap = {
  [S in RealtimeScope]: Record<string, (payload: unknown, context: ScopeContextMap[S]) => void>;
};

const realtimeChannelByScope: ScopeRegistryMap = {
  lobby: {
    ERROR: (payload, context) => {
      const p = payload as any;
      const message = p?.message ?? p?.error ?? "Unknown realtime error";
      context.onError?.(String(message));
    },
    SESSION_RESTORED: (payload, context) => {
      const p = payload as any;
      if (p?.userId) context.onSessionRestored?.(String(p.userId));
    },
    TABLE_LIST: (payload, context) => {
      const p = payload as any;
      context.onTableList?.(Array.isArray(p?.tables) ? p.tables : []);
    },
    CONNECTED: (_payload, context) => {
      context.onTransportState?.("CONNECTED");
    },
    DISCONNECTED: (_payload, context) => {
      context.onTransportState?.("DISCONNECTED");
    },
    RECONNECTING: (_payload, context) => {
      context.onTransportState?.("RECONNECTING");
    },
  },
  table: {
    WELCOME: (_payload, context) => {
      context.setStatus?.("CONNECTED");
    },
    SESSION_RESTORED: (_payload, context) => {
      context.setStatus?.("CONNECTED");
    },
    TABLE_SNAPSHOT: (payload, context) => {
      if (!context.tableId) return;
      context.onSnapshot?.(context.tableId, payload as TableSnapshotPayload);
    },
    ERROR: (payload, context) => {
      const p = payload as any;
      const message = p?.message ?? p?.error ?? "Table message error";
      context.onError?.(String(message));
    },
    CONNECTED: (_payload, context) => {
      context.setStatus?.("CONNECTED");
    },
    DISCONNECTED: (_payload, context) => {
      context.setStatus?.("DISCONNECTED");
    },
    RECONNECTING: (_payload, context) => {
      context.setStatus?.("RECONNECTING");
    },
    CHAT_MESSAGE: (payload, context) => {
      const p = payload as ChatMessagePayload;
      if (p?.tableId && p?.id) {
        storeRegistry.table().appendChatMessage(p.tableId, p);
      }
    },
  },
};

const realtimeChannelOrdered = (Object.keys(realtimeChannelByScope) as RealtimeScope[]).map((scope) => ({
  scope,
  ordered: Object.entries(realtimeChannelByScope[scope]).map(([type, handler]) => ({ type, handler })),
}));

export const realtimeChannelRegistry = {
  byScope: realtimeChannelByScope,
  ordered: realtimeChannelOrdered,
} as const;

export function dispatchRealtimeChannelMessage<S extends RealtimeScope>(
  scope: S,
  type: string,
  payload: unknown,
  context: ScopeContextMap[S],
) {
  const isValid = scope === "lobby" ? isValidLobbyOutbound(type, payload) : isValidTableOutbound(type, payload);
  if (!isValid) {
    (context as { onError?: (message: string) => void }).onError?.("INVALID_REALTIME_MESSAGE");
    return;
  }

  const handler = realtimeChannelRegistry.byScope[scope][type];
  if (!handler) return;
  handler(payload, context);
}
