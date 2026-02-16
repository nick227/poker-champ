import { useRealtimeChannel } from "./useRealtimeChannel";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";
import { isValidLobbyInbound } from "./contract.guards";

export function useLobbyRealtime() {
  useRealtimeChannel({
    scope: "lobby",
    onMessage: ({ type, payload }) => {
      dispatchRealtimeChannelMessage("lobby", type, payload, {
        onError: (message) => {
          storeRegistry.use.lobby.setState({ error: message });
        },
        onTableList: (tables) => {
          storeRegistry.use.lobby.setState({ tables });
        },
        onTransportState: (state) => {
          storeRegistry.use.lobby.setState({ transportState: state });
        },
      });
    },
    onError: (message) => {
      storeRegistry.use.lobby.setState({ error: message });
    },
    onOpen: (send) => {
      storeRegistry.use.lobby.setState({ error: null });
      if (!isValidLobbyInbound("LIST_TABLES")) {
        storeRegistry.use.lobby.setState({ error: "INVALID_OUTBOUND_MESSAGE" });
        return;
      }
      send("LIST_TABLES");
    },
  });
}
