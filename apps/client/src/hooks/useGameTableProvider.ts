import { useCallback } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TableAction } from "@/components/domain/table/ActionBar";
import { assertTableProvider, type TableProvider } from "@/types/tableProvider";
import { storeRegistry } from "@/registry/store.registry";
import { buildTableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";

interface UseGameTableProviderProps {
  tableId: string;
}

const TABLE_ACTION_TO_KEY: Record<TableAction, "fold" | "check" | "call" | "bet" | "raise" | "allIn"> = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALL_IN: "allIn",
};

/**
 * Game provider that wraps existing table logic for the frozen TableProvider contract.
 * 
 * This hook extracts the current GAME logic and returns it as a TableProvider,
 * making the game mode just another provider in the architecture.
 */
export function useGameTableProvider({ tableId }: UseGameTableProviderProps): TableProvider {
  // Get current snapshot from store
  const snapshot = storeRegistry.table().snapshotsByTableId[tableId] as TableSnapshotPayload;
  const connectionStatus = storeRegistry.table().connectionStatusByTableId[tableId] ?? "DISCONNECTED";

  // Existing action handling logic extracted from TableScreen
  const onAction = useCallback(
    (payload: { type: TableAction; amount?: number }) => {
      const action = TABLE_ACTION_TO_KEY[payload.type];
       
      console.log("[TABLE_ACTION_SEND]", { tableId, action, amountCents: payload.amount });
      const ok = storeRegistry.tables().dispatchTableAction({ tableId, action, amountCents: payload.amount });
      if (!ok) {
        console.log("TABLE_ACTION_FALLBACK", { action, tableId, reason: "sender-not-registered-or-invalid-payload" });
      }
    },
    [tableId]
  );

  return assertTableProvider({
    snapshot,
    sceneModel: buildTableSceneModel(snapshot, null, connectionStatus),
    onAction,
  });
}
