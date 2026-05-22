import { useMemo } from "react";
import { useTableRealtime } from "@/features/table/realtime/useTableRealtime";
import type { TableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";
import type { LobbyTableRow } from "@/lib/lobbyTables";

type UseTableConnectionOptions = {
  tableId: string;
  persistedRoomId?: string;
  tableById: Map<string, LobbyTableRow>;
  buyInCents?: number;
  authHydrated: boolean;
  hasAuthToken: boolean;
  reconnectNonce?: number;
  onError?: (message: string) => void;
  onTableGone?: (tableId: string) => void;
  onTerminalJoinFailure?: (tableId: string, message: string) => void;
  onReadyRoom?: (room: TableRealtimeRoom | null) => void;
};

export function useTableConnection({
  tableId,
  persistedRoomId,
  tableById,
  buyInCents,
  authHydrated,
  hasAuthToken,
  reconnectNonce = 0,
  onError,
  onTableGone,
  onTerminalJoinFailure,
  onReadyRoom,
}: UseTableConnectionOptions): {
  hasValidBuyIn: boolean;
  realtimeRoomId: string;
} {
  const realtimeRoomId = useMemo(() => {
    if (persistedRoomId && persistedRoomId.length > 0) return persistedRoomId;
    const byTableId = tableById.get(tableId);
    if (byTableId?.roomId && byTableId.roomId.length > 0) return byTableId.roomId;
    return tableId;
  }, [persistedRoomId, tableById, tableId]);

  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const shouldConnectRealtime = authHydrated && hasAuthToken && Boolean(tableId);

  useTableRealtime({
    tableId,
    roomId: realtimeRoomId,
    buyInCents,
    enabled: shouldConnectRealtime,
    reconnectNonce,
    onError,
    onTableGone,
    onTerminalJoinFailure,
    onReadyRoom,
  });

  return { hasValidBuyIn, realtimeRoomId };
}

