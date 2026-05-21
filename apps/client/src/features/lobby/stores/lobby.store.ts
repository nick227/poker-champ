import { create } from "zustand";
import { getLobbyChatMessages, getLobbyTables, type LobbyChatMessageDto } from "@/services/get/lobby.get";
import type { OnlinePlayerSummary } from "@poker-champ/realtime-contract";

const LOBBY_CHAT_MAX = 400;
const LOBBY_CHAT_DEFAULT_SCOPE = "lobby";
const LOBBY_CHAT_PAGE_SIZE = 50;

function compareChatDesc(a: LobbyChatMessageDto, b: LobbyChatMessageDto): number {
  if (a.createdAtTs !== b.createdAtTs) return b.createdAtTs - a.createdAtTs;
  return b.id.localeCompare(a.id);
}

function dedupeSortAndTrim(input: LobbyChatMessageDto[]): { messages: LobbyChatMessageDto[]; trimmed: boolean } {
  const byId = new Map<string, LobbyChatMessageDto>();
  for (const message of input) {
    if (!message?.id) continue;
    if (byId.has(message.id)) continue;
    byId.set(message.id, message);
  }
  const sorted = [...byId.values()].sort(compareChatDesc);
  if (sorted.length <= LOBBY_CHAT_MAX) return { messages: sorted, trimmed: false };
  return { messages: sorted.slice(0, LOBBY_CHAT_MAX), trimmed: true };
}

type LobbyState = {
  tables: unknown[];
  onlineTotal: number;
  onlinePlayers: OnlinePlayerSummary[];
  onlineBusy: boolean;
  onlineError: string | null;
  busy: boolean;
  error: string | null;
  transportState: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  lobbyVoiceParticipantIds: string[];
  lobbyVoiceServerNowTs: number | null;
  chatMessages: LobbyChatMessageDto[];
  chatScope: string;
  chatNextCursor: string | null;
  chatHasMore: boolean;
  chatLoading: boolean;
  chatLoadingMore: boolean;
  chatLoaded: boolean;
  chatError: string | null;
  refresh: (opts?: { background?: boolean }) => Promise<void>;
  loadInitialLobbyChat: (opts?: { scope?: string; force?: boolean }) => Promise<void>;
  loadOlderLobbyChat: () => Promise<void>;
  appendLobbyChatRealtime: (message: LobbyChatMessageDto) => void;
};

export const useLobbyStore = create<LobbyState>((set) => ({
  tables: [],
  onlineTotal: 0,
  onlinePlayers: [],
  onlineBusy: false,
  onlineError: null,
  busy: false,
  error: null,
  transportState: "DISCONNECTED",
  lobbyVoiceParticipantIds: [],
  lobbyVoiceServerNowTs: null,
  chatMessages: [],
  chatScope: LOBBY_CHAT_DEFAULT_SCOPE,
  chatNextCursor: null,
  chatHasMore: false,
  chatLoading: false,
  chatLoadingMore: false,
  chatLoaded: false,
  chatError: null,
  refresh: async (opts) => {
    const background = opts?.background === true;
    if (!background) set({ busy: true, error: null });
    try {
      const tables = await getLobbyTables();
      set({ tables, busy: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Failed to load tables", busy: false });
    }
  },
  loadInitialLobbyChat: async (opts) => {
    const scope = opts?.scope ?? LOBBY_CHAT_DEFAULT_SCOPE;
    const force = opts?.force === true;
    const state = useLobbyStore.getState();
    if (!force && state.chatLoaded && state.chatScope === scope) return;
    set({ chatLoading: true, chatError: null, chatScope: scope });
    try {
      const result = await getLobbyChatMessages({ scope, limit: LOBBY_CHAT_PAGE_SIZE });
      const { messages } = dedupeSortAndTrim(result.messages);
      set({
        chatMessages: messages,
        chatNextCursor: result.nextCursor,
        chatHasMore: Boolean(result.nextCursor),
        chatLoading: false,
        chatLoaded: true,
        chatError: null,
      });
    } catch (e: any) {
      set({
        chatLoading: false,
        chatLoaded: false,
        chatError: e?.message ?? "Failed to load chat",
      });
    }
  },
  loadOlderLobbyChat: async () => {
    const state = useLobbyStore.getState();
    if (state.chatLoading || state.chatLoadingMore || !state.chatHasMore || !state.chatNextCursor) return;
    set({ chatLoadingMore: true, chatError: null });
    try {
      const result = await getLobbyChatMessages({
        scope: state.chatScope,
        cursor: state.chatNextCursor,
        limit: LOBBY_CHAT_PAGE_SIZE,
      });
      const merged = dedupeSortAndTrim([...state.chatMessages, ...result.messages]);
      set({
        chatMessages: merged.messages,
        chatNextCursor: result.nextCursor,
        chatHasMore: merged.trimmed || Boolean(result.nextCursor),
        chatLoadingMore: false,
      });
    } catch (e: any) {
      set({
        chatLoadingMore: false,
        chatError: e?.message ?? "Failed to load older chat",
      });
    }
  },
  appendLobbyChatRealtime: (message) =>
    set((s) => {
      if (!message?.id) return s;
      if (message.scope !== s.chatScope) return s;
      if (s.chatMessages.some((m) => m.id === message.id)) return s;
      const merged = dedupeSortAndTrim([message, ...s.chatMessages]);
      return {
        chatMessages: merged.messages,
        chatHasMore: merged.trimmed || s.chatHasMore,
      };
    }),
}));
