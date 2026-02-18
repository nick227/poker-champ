import { useEffect, useMemo } from "react";
import { useRealtimeChannel } from "./useRealtimeChannel";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";

type UseTableRealtimeOptions = {
  tableId: string;
  roomId?: string;
  buyInCents?: number;
  password?: string;
  enabled?: boolean;
  onError?: (message: string) => void;
};

export function useTableRealtime({ tableId, roomId, buyInCents, password, enabled = true, onError }: UseTableRealtimeOptions) {
  const authHydrated = storeRegistry.use.auth((s) => s.hydrated);
  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const debugLog = (...args: unknown[]) => {
     
    console.log("[TABLE_RT]", ...args);
  };
  const joinOptions = useMemo(
    () =>
      hasValidBuyIn
        ? ({
            tableId,
            buyInCents: Number(buyInCents),
            ...(password ? { password } : {}),
          } as const)
        : undefined,
    [tableId, buyInCents, hasValidBuyIn, password],
  );

  const realtime = useRealtimeChannel({
    scope: "table",
    id: roomId ?? tableId,
    enabled: Boolean(tableId) && enabled,
    authHydrated,
    joinOptions,
    onMessage: ({ type, payload }) => {
      if (type === "TABLE_SNAPSHOT") {
        const snap = payload as { hand?: { handId?: string; street?: string }; reason?: string; actionId?: string; version?: number; snapshotSeq?: number } | undefined;
        debugLog("INBOUND", { tableId, type, reason: snap?.reason, handId: snap?.hand?.handId, street: snap?.hand?.street, actionId: snap?.actionId, version: snap?.version, snapshotSeq: snap?.snapshotSeq });
        
        // Log actionId correlation for diagnostics
        if (snap?.actionId) {
          console.log(`[TABLE_RT] Action completed: ${snap.actionId} for table ${tableId}`);
        }
      } else if (type === "ERROR") {
        const error = payload as any;
        debugLog("INBOUND", { tableId, type, code: error?.code, message: error?.message, actionId: error?.actionId });
        
        // Log actionId error correlation for diagnostics
        if (error?.actionId) {
          console.error(`[TABLE_RT] Action failed: ${error.actionId} for table ${tableId}`, error.message || error.code);
        }
      } else if (type === "WELCOME" || type === "SESSION_RESTORED" || type === "RECONNECTING" || type === "DISCONNECTED" || type === "CONNECTED") {
        debugLog("INBOUND", { tableId, type, payload });
      }
      dispatchRealtimeChannelMessage("table", type, payload, {
        tableId,
        onSnapshot: (targetTableId, snapshot) => {
          storeRegistry.table().setSnapshot(targetTableId, snapshot);
        },
        setStatus: (status) => {
          storeRegistry.table().setConnectionStatus(tableId, status as "CONNECTED" | "RECONNECTING" | "DISCONNECTED");
          debugLog("STATUS", { tableId, status });
        },
        onError: (message) => {
          storeRegistry.table().setError(tableId, message);
          debugLog("ERROR", { tableId, message });
          onError?.(message);
        },
      });
    },
    onError: (message) => {
      const normalized = message && message.trim().length > 0 ? message : "Connection closed unexpectedly";
      storeRegistry.table().setError(tableId, normalized);
      debugLog("TRANSPORT_ERROR", { tableId, message: normalized });
      onError?.(normalized);
    },
  });

  useEffect(() => {
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
    };
  }, [tableId, roomId, realtime, enabled, authHydrated, hasValidBuyIn, buyInCents, password]);
}
