import { useMemo } from "react";
import { useTableRealtime } from "@/realtime/useTableRealtime";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";
import type { LobbyTableRow } from "@/lib/lobbyTables";

type UseTableConnectionOptions = {
  tableId: string;
  persistedRoomId?: string;
  normalizedLobbyTables: LobbyTableRow[];
  buyInCents?: number;
  authHydrated: boolean;
  hasAuthToken: boolean;
  onError?: (message: string) => void;
  onTableGone?: (tableId: string) => void;
  onReadyRoom?: (room: TableRealtimeRoom | null) => void;
};

export function useTableConnection({
  tableId,
  persistedRoomId,
  normalizedLobbyTables,
  buyInCents,
  authHydrated,
  hasAuthToken,
  onError,
  onTableGone,
  onReadyRoom,
}: UseTableConnectionOptions): {
  hasValidBuyIn: boolean;
  realtimeRoomId: string;
} {
  const realtimeRoomId = useMemo(() => {
    if (persistedRoomId && persistedRoomId.length > 0) return persistedRoomId;
    const byTableId = normalizedLobbyTables.find((t) => t.tableId === tableId || t.id === tableId);
    if (byTableId?.roomId && byTableId.roomId.length > 0) return byTableId.roomId;
    return tableId;
  }, [persistedRoomId, normalizedLobbyTables, tableId]);

  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const shouldConnectRealtime = authHydrated && hasAuthToken && Boolean(tableId);

  useTableRealtime({
    tableId,
    roomId: realtimeRoomId,
    buyInCents,
    enabled: shouldConnectRealtime,
    onError,
    onTableGone,
    onReadyRoom,
  });

  return { hasValidBuyIn, realtimeRoomId };
}
