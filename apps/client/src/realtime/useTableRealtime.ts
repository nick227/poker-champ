import { useEffect, useMemo, useRef } from "react";
import { useRealtimeChannel } from "./useRealtimeChannel";
import { storeRegistry } from "@/registry/store.registry";
import { handleTableRealtimeInboundMessage } from "@/realtime/tableRealtime.message";

export type TableRealtimeRoom = {
  send: (type: string, payload?: unknown) => void;
  onMessage: (type: string, cb: (payload: unknown) => void) => void;
};

export function isTableRealtimeRoom(value: unknown): value is TableRealtimeRoom {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { send?: unknown; onMessage?: unknown };
  return typeof candidate.send === "function" && typeof candidate.onMessage === "function";
}

type UseTableRealtimeOptions = {
  tableId: string;
  roomId?: string;
  buyInCents?: number;
  password?: string;
  enabled?: boolean;
  onError?: (message: string) => void;
  onTableGone?: (tableId: string) => void;
  onReadyRoom?: (room: TableRealtimeRoom | null) => void;
};

export function useTableRealtime({
  tableId,
  roomId,
  buyInCents,
  password,
  enabled = true,
  onError,
  onTableGone,
  onReadyRoom,
}: UseTableRealtimeOptions) {
  const authHydrated = storeRegistry.use.auth((s) => s.hydrated);
  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const debugLog = (...args: unknown[]) => {
    console.log("[TABLE_RT]", ...args);
  };
  const onErrorRef = useRef(onError);
  const onTableGoneRef = useRef(onTableGone);
  const onReadyRoomRef = useRef(onReadyRoom);
  onErrorRef.current = onError;
  onTableGoneRef.current = onTableGone;
  onReadyRoomRef.current = onReadyRoom;

  const joinOptions = useMemo(
    () =>
      ({
        tableId,
        ...(hasValidBuyIn ? { buyInCents: Number(buyInCents) } : {}),
        ...(password ? { password } : {}),
      }) as const,
    [tableId, buyInCents, hasValidBuyIn, password],
  );

  const realtime = useRealtimeChannel({
    scope: "table",
    id: roomId ?? tableId,
    enabled: Boolean(tableId) && enabled,
    authHydrated,
    joinOptions,
    onMessage: ({ type, payload }) => {
      handleTableRealtimeInboundMessage({
        tableId,
        type,
        payload,
        deps: {
          setRoomForTable: (t, r) => storeRegistry.tables().setRoomForTable(t, r),
          resetSnapshotStream: (t) => storeRegistry.table().resetSnapshotStream(t),
          setSnapshot: (t, snapshot) => storeRegistry.table().setSnapshot(t, snapshot),
          appendChatMessage: (t, message) => storeRegistry.table().appendChatMessage(t, message),
          setBotSummaries: (t, bots) => storeRegistry.table().setBotSummaries(t, bots),
          setConnectionStatus: (t, status) => storeRegistry.table().setConnectionStatus(t, status),
          clearConnectionStatus: (t) => storeRegistry.table().clearConnectionStatus(t),
          setError: (t, message) => storeRegistry.table().setError(t, message),
          onError: (m) => onErrorRef.current?.(m),
          onTableGone: (t) => onTableGoneRef.current?.(t),
          debugLog,
        },
      });
    },
    onError: (message) => {
      const normalized = message && message.trim().length > 0 ? message : "Connection closed unexpectedly";
      storeRegistry.table().setError(tableId, normalized);
      debugLog("TRANSPORT_ERROR", { tableId, message: normalized });
      onErrorRef.current?.(normalized);
    },
    onOpen: (_send, getNativeRoom) => {
      const nativeRoom = getNativeRoom?.() ?? null;
      onReadyRoomRef.current?.(isTableRealtimeRoom(nativeRoom) ? nativeRoom : null);
    },
    onClose: () => {
      onReadyRoomRef.current?.(null);
    },
  });

  useEffect(() => {
    if (roomId && roomId.length > 0) {
      const current = storeRegistry.tables().roomIdByTableId[tableId];
      if (current !== roomId) {
        storeRegistry.tables().setRoomForTable(tableId, roomId);
      }
    }
    debugLog("CONNECT_CONFIG", {
      tableId,
      roomId: roomId ?? tableId,
      enabled,
      authHydrated,
      hasValidBuyIn,
      buyInCents: hasValidBuyIn ? Number(buyInCents) : undefined,
      hasPassword: Boolean(password),
    });
    storeRegistry.tables().registerTableSender(tableId, realtime.send);
    return () => {
      debugLog("DISPOSE", { tableId });
      storeRegistry.tables().unregisterTableSender(tableId);
      onReadyRoomRef.current?.(null);
    };
  }, [tableId, roomId, realtime, enabled, authHydrated, hasValidBuyIn, buyInCents, password]);
}
