import { useCallback } from "react";
import { useRealtimeChannel } from "./useRealtimeChannel";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";
import { isValidLobbyInbound } from "./contract.guards";

export function useLobbyRealtime() {
  const { send } = useRealtimeChannel({
    scope: "lobby",
    onMessage: ({ type, payload }) => {
      dispatchRealtimeChannelMessage("lobby", type, payload, {
        onError: (message) => {
          storeRegistry.use.lobby.setState({ error: message, onlineBusy: false, onlineError: message });
        },
        onTableList: (tables) => {
          storeRegistry.use.lobby.setState({ tables });
        },
        onOnlineCount: (totalOnline) => {
          storeRegistry.use.lobby.setState({ onlineTotal: totalOnline });
        },
        onOnlinePlayers: ({ totalOnline, players }) => {
          storeRegistry.use.lobby.setState({ onlineTotal: totalOnline, onlinePlayers: players, onlineBusy: false, onlineError: null });
        },
        onTransportState: (state) => {
          storeRegistry.use.lobby.setState({ transportState: state });
        },
      });
    },
    onError: (message) => {
      storeRegistry.use.lobby.setState({ error: message, onlineBusy: false, onlineError: message });
    },
    onOpen: (send) => {
      storeRegistry.use.lobby.setState({ error: null });
      if (!isValidLobbyInbound("LIST_TABLES")) {
        storeRegistry.use.lobby.setState({ error: "INVALID_OUTBOUND_MESSAGE" });
        return;
      }
      send("LIST_TABLES");
      if (isValidLobbyInbound("LIST_ONLINE_PLAYERS")) {
        send("LIST_ONLINE_PLAYERS");
      }
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

  return { requestOnlinePlayers };
}
