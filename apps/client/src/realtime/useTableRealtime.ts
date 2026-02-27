import { useEffect, useMemo, useRef } from "react";
import { useRealtimeChannel } from "./useRealtimeChannel";
import { storeRegistry } from "@/registry/store.registry";
import { handleTableRealtimeInboundMessage } from "@/realtime/tableRealtime.message";

export type TableRealtimeRoom = {
  send: (type: string, payload?: unknown) => void;
  onMessage: (type: string, cb: (payload: unknown) => void) => void;
  leave?: (consented?: boolean) => void | Promise<void>;
  disconnect?: (consented?: boolean) => void;
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
  const realtimeSendRef = useRef<(type: string, payload?: unknown) => boolean>(() => false);
  const realtimeDisconnectRef = useRef<(consented?: boolean) => void>(() => undefined);
  const nativeRoomRef = useRef<TableRealtimeRoom | null>(null);
  const bridgedRoomRef = useRef<TableRealtimeRoom | null>(null);
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
          setActiveSessionId: (t, sessionId) => storeRegistry.table().setActiveSessionId(t, sessionId),
          getActiveSessionId: (t) => storeRegistry.table().getActiveSessionId(t),
          clearActiveSessionId: (t) => storeRegistry.table().clearActiveSessionId(t),
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
      if (isTableRealtimeRoom(nativeRoom)) {
        const room = nativeRoom as TableRealtimeRoom;
        if (nativeRoomRef.current !== room || !bridgedRoomRef.current) {
          nativeRoomRef.current = room;
          bridgedRoomRef.current = {
            // Keep prototype methods intact by delegating instead of spreading.
            send: (type: string, payload?: unknown) => room.send(type, payload),
            onMessage: (type: string, cb: (payload: unknown) => void) => room.onMessage(type, cb),
            leave: (consented?: boolean) => room.leave?.(consented),
            disconnect: (consented?: boolean) => realtimeDisconnectRef.current(consented),
          };
        }
        onReadyRoomRef.current?.(bridgedRoomRef.current);
        return;
      }
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    },
    onClose: () => {
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    },
  });

  // Update the send ref whenever realtime changes
  realtimeSendRef.current = realtime.send;
  realtimeDisconnectRef.current = realtime.disconnect;

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
  }, [tableId, roomId, enabled, authHydrated, hasValidBuyIn, buyInCents, password]);

  useEffect(() => {
    storeRegistry.tables().registerTableSender(tableId, realtimeSendRef.current);
    return () => {
      debugLog("DISPOSE", { tableId });
      storeRegistry.tables().unregisterTableSender(tableId);
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    };
  }, [tableId]);
}
