import { useEffect, useMemo } from "react";
import { useRealtimeChannel } from "./useRealtimeChannel";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { storeRegistry } from "@/registry/store.registry";

type UseTableRealtimeOptions = {
  tableId: string;
  buyInCents?: number;
  password?: string;
  onError?: (message: string) => void;
};

export function useTableRealtime({ tableId, buyInCents, password, onError }: UseTableRealtimeOptions) {
  const hasValidBuyIn = Number.isInteger(buyInCents) && Number(buyInCents) > 0;
  const joinOptions = useMemo(
    () =>
      hasValidBuyIn
        ? ({
            buyInCents: Number(buyInCents),
            ...(password ? { password } : {}),
          } as const)
        : undefined,
    [buyInCents, hasValidBuyIn, password],
  );

  const realtime = useRealtimeChannel({
    scope: "table",
    id: tableId,
    enabled: hasValidBuyIn,
    joinOptions,
    onMessage: ({ type, payload }) => {
      dispatchRealtimeChannelMessage("table", type, payload, {
        tableId,
        onSnapshot: (targetTableId, snapshot) => {
          storeRegistry.table().setSnapshot(targetTableId, snapshot);
        },
        setStatus: (status) => {
          storeRegistry.table().setStatus(tableId, status);
          // eslint-disable-next-line no-console
          console.log(`TABLE_STATUS:${tableId}`, status);
        },
        onError: (message) => {
          storeRegistry.table().setError(tableId, message);
          onError?.(message);
        },
      });
    },
    onError,
  });

  useEffect(() => {
    if (!hasValidBuyIn) {
      onError?.("MISSING_BUY_IN_CENTS");
    }
  }, [hasValidBuyIn, onError]);

  useEffect(() => {
    storeRegistry.tables().registerTableSender(tableId, realtime.send);
    return () => {
      storeRegistry.tables().unregisterTableSender(tableId);
    };
  }, [tableId, realtime]);
}
