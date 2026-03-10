import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLobbyRealtime } from "@/features/lobby/realtime/useLobbyRealtime";
import type { TableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";
import { useAuthStore } from "@/stores/auth.store";

type LobbyRealtimeBridgeContextValue = {
  lobbyRoom: TableRealtimeRoom | null;
  sendLobby: (type: string, payload?: unknown) => boolean;
  requestOnlinePlayers: () => void;
};

const LobbyRealtimeBridgeContext = createContext<LobbyRealtimeBridgeContextValue>({
  lobbyRoom: null,
  sendLobby: () => false,
  requestOnlinePlayers: () => {},
});

let primaryBridgeMounted = false;

export function LobbyRealtimeBridge({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const [lobbyRoom, setLobbyRoom] = useState<TableRealtimeRoom | null>(null);
  const [isPrimaryBridge] = useState(() => {
    if (primaryBridgeMounted) return false;
    primaryBridgeMounted = true;
    return true;
  });
  const shouldConnect = isPrimaryBridge && authHydrated && Boolean(token);

  const { send, requestOnlinePlayers } = useLobbyRealtime({
    onReadyRoom: setLobbyRoom,
    enabled: shouldConnect,
    authHydrated,
  });

  useEffect(() => {
    if (!shouldConnect) {
      setLobbyRoom(null);
    }
  }, [shouldConnect]);

  useEffect(
    () => () => {
      if (isPrimaryBridge) {
        primaryBridgeMounted = false;
      }
    },
    [isPrimaryBridge],
  );

  const value = useMemo(
    () => ({
      lobbyRoom,
      sendLobby: send,
      requestOnlinePlayers,
    }),
    [lobbyRoom, send, requestOnlinePlayers],
  );

  return (
    <LobbyRealtimeBridgeContext.Provider value={value}>
      {children}
    </LobbyRealtimeBridgeContext.Provider>
  );
}

export function useLobbyRealtimeBridge() {
  return useContext(LobbyRealtimeBridgeContext);
}

