import { useCallback, useRef } from "react";
import { useRealtimeChannel } from "@/realtime/useRealtimeChannel";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";
import { isValidLobbyInbound } from "@/realtime/contract.guards";
import { isTableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";
import type { TableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";

const LOBBY_VOICE_PARTICIPANTS = "LOBBY_VOICE_PARTICIPANTS";

export type UseLobbyRealtimeOptions = {
  onReadyRoom?: (room: TableRealtimeRoom | null) => void;
  enabled?: boolean;
  authHydrated?: boolean;
};

export function mergeLobbyTableViewerState(previous: unknown[], incoming: unknown[]): unknown[] {
  const previousById = new Map<string, Record<string, unknown>>();
  for (const value of previous) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const id = String(row.tableId ?? row.id ?? "");
    if (id) previousById.set(id, row);
  }
  return incoming.map((value) => {
    if (!value || typeof value !== "object") return value;
    const row = value as Record<string, unknown>;
    const prior = previousById.get(String(row.tableId ?? row.id ?? ""));
    const priorViewer = prior?.viewer;
    if (!priorViewer || typeof priorViewer !== "object") return value;
    const priorCanResume = (priorViewer as Record<string, unknown>).canResume === true;
    const incomingViewer = row.viewer;
    const incomingCanResume =
      incomingViewer && typeof incomingViewer === "object"
        ? (incomingViewer as Record<string, unknown>).canResume === true
        : false;
    // Generic lobby broadcasts have no viewer context. Preserve the last
    // authenticated HTTP answer until the next authoritative refresh.
    return priorCanResume && !incomingCanResume ? { ...row, viewer: priorViewer } : value;
  });
}

export function useLobbyRealtime(options?: UseLobbyRealtimeOptions) {
  const lastServerNowTsRef = useRef(0);

  const { send } = useRealtimeChannel({
    scope: "lobby",
    enabled: options?.enabled,
    authHydrated: options?.authHydrated,
    onMessage: ({ type, payload }) => {
      if (type === LOBBY_VOICE_PARTICIPANTS) {
        const p = payload as { userIds?: string[]; serverNowTs?: number } | undefined;
        if (typeof p?.serverNowTs === "number") {
          if (p.serverNowTs < lastServerNowTsRef.current) return;
          lastServerNowTsRef.current = p.serverNowTs;
        }
        const raw = Array.isArray(p?.userIds) ? p.userIds : [];
        const userIds = [...new Set(raw)];
        const serverNowTs = typeof p?.serverNowTs === "number" && p.serverNowTs >= 0 ? p.serverNowTs : null;
        storeRegistry.use.lobby.setState({ lobbyVoiceParticipantIds: userIds, lobbyVoiceServerNowTs: serverNowTs });
        return;
      }
      dispatchRealtimeChannelMessage("lobby", type, payload, {
        onError: (message) => {
          storeRegistry.use.lobby.setState({ error: message, onlineBusy: false, onlineError: message });
        },
        onTableList: (tables) => {
          storeRegistry.use.lobby.setState((state) => ({
            tables: mergeLobbyTableViewerState(state.tables, tables),
          }));
        },
        onOnlineCount: (totalOnline) => {
          storeRegistry.use.lobby.setState({ onlineTotal: totalOnline });
        },
        onOnlinePlayers: ({ totalOnline, players }) => {
          storeRegistry.use.lobby.setState({ onlineTotal: totalOnline, onlinePlayers: players, onlineBusy: false, onlineError: null });
        },
        onLobbyChatMessage: (message) => {
          storeRegistry.lobby().appendLobbyChatRealtime({
            id: message.id,
            scope: message.scope,
            senderUserId: message.senderUserId,
            senderName: message.senderName,
            text: message.text,
            createdAtTs: message.createdAtTs,
          });
        },
        onTransportState: (state) => {
          storeRegistry.use.lobby.setState({ transportState: state });
        },
      });
    },
    onError: (message) => {
      storeRegistry.use.lobby.setState({ error: message, onlineBusy: false, onlineError: message });
    },
    onOpen: (sendFn, getNativeRoom) => {
      storeRegistry.use.lobby.setState({ error: null });
      const nativeRoom = getNativeRoom?.() ?? null;
      options?.onReadyRoom?.(isTableRealtimeRoom(nativeRoom) ? nativeRoom : null);
      if (!isValidLobbyInbound("LIST_TABLES")) {
        storeRegistry.use.lobby.setState({ error: "INVALID_OUTBOUND_MESSAGE" });
        return;
      }
      sendFn("LIST_TABLES");
      if (isValidLobbyInbound("LIST_ONLINE_PLAYERS")) {
        sendFn("LIST_ONLINE_PLAYERS");
      }
    },
    onClose: () => {
      options?.onReadyRoom?.(null);
    },
  });

  const requestOnlinePlayers = useCallback(() => {
    if (!isValidLobbyInbound("LIST_ONLINE_PLAYERS")) {
      storeRegistry.use.lobby.setState({ onlineBusy: false, onlineError: "INVALID_OUTBOUND_MESSAGE" });
      return;
    }
    storeRegistry.use.lobby.setState({ onlineBusy: true, onlineError: null });
    const sent = send("LIST_ONLINE_PLAYERS");
    if (!sent) {
      storeRegistry.use.lobby.setState({ onlineBusy: false, onlineError: "LOBBY_OFFLINE" });
    }
  }, [send]);

  return { requestOnlinePlayers, send };
}
