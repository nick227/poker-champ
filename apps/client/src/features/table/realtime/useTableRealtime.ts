import { useEffect, useMemo, useRef } from "react";
import { useRealtimeChannel } from "@/realtime/useRealtimeChannel";
import { storeRegistry } from "@/registry/store.registry";
import { syncTableRoomIdFromProp } from "@/lib/tableRoomIdHint";
import { isNotFoundJoinMessage, logTournamentJoinBlockedClient } from "@/lib/tournamentJoinDiagnostics";
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
  reconnectNonce?: number;
  onError?: (message: string) => void;
  onTableGone?: (tableId: string) => void;
  onTerminalJoinFailure?: (tableId: string, message: string) => void;
  onReadyRoom?: (room: TableRealtimeRoom | null) => void;
};

export function useTableRealtime({
  tableId,
  roomId,
  buyInCents,
  password,
  enabled = true,
  reconnectNonce = 0,
  onError,
  onTableGone,
  onTerminalJoinFailure,
  onReadyRoom,
}: UseTableRealtimeOptions) {
  const authHydrated = storeRegistry.use.auth((s) => s.hydrated);
  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const debugLog = (...args: unknown[]) => {
    console.log("[TABLE_RT]", ...args);
  };
  const onErrorRef = useRef(onError);
  const onTableGoneRef = useRef(onTableGone);
  const onTerminalJoinFailureRef = useRef(onTerminalJoinFailure);
  const onReadyRoomRef = useRef(onReadyRoom);
  const realtimeSendRef = useRef<(type: string, payload?: unknown) => boolean>(() => false);
  const realtimeDisconnectRef = useRef<(consented?: boolean) => void>(() => undefined);
  const nativeRoomRef = useRef<TableRealtimeRoom | null>(null);
  const bridgedRoomRef = useRef<TableRealtimeRoom | null>(null);
  const didDisconnectOthersRef = useRef(false);
  onErrorRef.current = onError;
  onTableGoneRef.current = onTableGone;
  onTerminalJoinFailureRef.current = onTerminalJoinFailure;
  onReadyRoomRef.current = onReadyRoom;

  const joinOptions = useMemo(
    () =>
      ({
        tableId,
        ...(hasValidBuyIn ? { buyInCents: Number(buyInCents) } : {}),
        ...(password ? { password } : {}),
      }) as const,
    [tableId, hasValidBuyIn, buyInCents, password],
  );

  // Disconnect any other table session so only one table connection is active (avoids black screen on quick table switch).
  // Run once per mount so we don't trigger a cascade of store/callback updates that could cause React #185 (max update depth).
  useEffect(() => {
    if (!tableId || !enabled || didDisconnectOthersRef.current) return;
    didDisconnectOthersRef.current = true;
    storeRegistry.tables().disconnectOtherTables(tableId);
  }, [tableId, enabled]);

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
          appendGiftEvent: (t, gift) => storeRegistry.table().appendGiftEvent(t, gift),
          setBotSummaries: (t, bots) => storeRegistry.table().setBotSummaries(t, bots),
          setConnectionStatus: (t, status) => storeRegistry.table().setConnectionStatus(t, status),
          clearConnectionStatus: (t) => storeRegistry.table().clearConnectionStatus(t),
          setActiveSessionId: (t, sessionId) => storeRegistry.table().setActiveSessionId(t, sessionId),
          getActiveSessionId: (t) => storeRegistry.table().getActiveSessionId(t),
          clearActiveSessionId: (t) => storeRegistry.table().clearActiveSessionId(t),
          setError: (t, message) => storeRegistry.table().setError(t, message),
          markTableWelcome: (t) => storeRegistry.table().markTableWelcome(t),
          markTableSessionRestore: (t) => storeRegistry.table().markTableSessionRestore(t),
          onError: (m) => onErrorRef.current?.(m),
          onTableGone: (t) => onTableGoneRef.current?.(t),
          onTerminalJoinFailure: (t, message) => onTerminalJoinFailureRef.current?.(t, message),
          debugLog,
        },
      });
    },
    onError: (message) => {
      const normalized = message && message.trim().length > 0 ? message : "Connection closed unexpectedly";
      storeRegistry.table().setError(tableId, normalized);
      debugLog("TRANSPORT_ERROR", { tableId, message: normalized });
      const joinState = storeRegistry.tables().tableJoinById?.[tableId];
      if (joinState?.tournamentId && isNotFoundJoinMessage(normalized)) {
        logTournamentJoinBlockedClient({
          tournamentId: joinState.tournamentId,
          reason: normalized,
          sourceFunction: "useTableRealtime:onError",
          extra: { tableId, roomId: roomId ?? null },
        });
      }
      onErrorRef.current?.(normalized);
      onTerminalJoinFailureRef.current?.(tableId, normalized);
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
        storeRegistry.tables().registerTableDisconnect(tableId, (consented) => realtimeDisconnectRef.current(consented));
        onReadyRoomRef.current?.(bridgedRoomRef.current);
        return;
      }
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    },
    onClose: () => {
      storeRegistry.tables().unregisterTableDisconnect(tableId);
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    },
  });

  useEffect(() => {
    syncTableRoomIdFromProp({
      tableId,
      propRoomId: roomId,
      currentRoomId: storeRegistry.tables().roomIdByTableId?.[tableId],
      setRoomForTable: (t, r) => storeRegistry.tables().setRoomForTable(t, r),
    });
    if (__DEV__) {
      debugLog("CONNECT_CONFIG", {
        tableId,
        roomId: roomId ?? tableId,
        enabled,
        authHydrated,
        hasValidBuyIn,
        buyInCents: hasValidBuyIn ? Number(buyInCents) : undefined,
        hasPassword: Boolean(password),
      });
    }
  }, [tableId, roomId, enabled, authHydrated, hasValidBuyIn, buyInCents, password]);

  useEffect(() => {
    if (reconnectNonce > 0) {
      debugLog("RECONNECT_NONCE", { tableId, reconnectNonce });
      realtime.disconnect(false);
    }
  }, [reconnectNonce, tableId, realtime.disconnect]);

  useEffect(() => {
    realtimeSendRef.current = realtime.send;
    realtimeDisconnectRef.current = realtime.disconnect;

    storeRegistry.tables().registerTableSender(tableId, realtime.send);
    return () => {
      debugLog("DISPOSE", { tableId });
      storeRegistry.tables().unregisterTableDisconnect(tableId);
      storeRegistry.tables().unregisterTableSender(tableId);
      nativeRoomRef.current = null;
      bridgedRoomRef.current = null;
      onReadyRoomRef.current?.(null);
    };
  }, [tableId, realtime.send, realtime.disconnect]);
}
