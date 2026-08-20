import { isValidLobbyOutbound, isValidTableOutbound } from "@/realtime/contract.guards";
import type {
  TableSnapshotPayload,
  ChatMessagePayload,
  OnlinePlayerSummary,
  BotSummary,
  GiftReceivedPayload,
} from "@poker-champ/realtime-contract";

export type RealtimeScope = "lobby" | "table";
export type TransportState = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
type LobbyChatMessagePayload = {
  id: string;
  scope: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAtTs: number;
};

type LobbyMessageContext = {
  onError?: (message: string) => void;
  onSessionRestored?: (userId: string) => void;
  onTableList?: (tables: unknown[]) => void;
  onOnlineCount?: (totalOnline: number) => void;
  onOnlinePlayers?: (payload: { totalOnline: number; generatedAt: number; players: OnlinePlayerSummary[] }) => void;
  onLobbyChatMessage?: (payload: LobbyChatMessagePayload) => void;
  onTransportState?: (state: TransportState) => void;
};

type TableMessageContext = {
  tableId?: string;
  setStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onSnapshot?: (tableId: string, snapshot: TableSnapshotPayload) => void;
  appendChatMessage?: (tableId: string, message: ChatMessagePayload) => void;
  onBotsList?: (tableId: string, bots: BotSummary[]) => void;
  appendGiftEvent?: (tableId: string, gift: GiftReceivedPayload) => void;
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
    ONLINE_COUNT: (payload, context) => {
      const p = payload as any;
      const totalOnline = typeof p?.totalOnline === "number" ? p.totalOnline : 0;
      context.onOnlineCount?.(totalOnline);
    },
    ONLINE_PLAYERS: (payload, context) => {
      const p = payload as any;
      context.onOnlinePlayers?.({
        totalOnline: typeof p?.totalOnline === "number" ? p.totalOnline : 0,
        generatedAt: typeof p?.generatedAt === "number" ? p.generatedAt : Date.now(),
        players: Array.isArray(p?.players) ? p.players : [],
      });
    },
    LOBBY_CHAT_MESSAGE: (payload, context) => {
      const p = payload as LobbyChatMessagePayload;
      if (!p?.id) return;
      context.onLobbyChatMessage?.(p);
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
        context.appendChatMessage?.(p.tableId, p);
      }
    },
    GIFT_RECEIVED: (payload, context) => {
      if (!context.tableId) return;
      const p = payload as GiftReceivedPayload;
      if (p?.interactionId) {
        context.appendGiftEvent?.(context.tableId, p);
      }
    },
    BOTS_LIST: (payload, context) => {
      const p = payload as { bots?: BotSummary[] };
      if (!context.tableId) return;
      context.onBotsList?.(context.tableId, Array.isArray(p?.bots) ? p.bots : []);
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
