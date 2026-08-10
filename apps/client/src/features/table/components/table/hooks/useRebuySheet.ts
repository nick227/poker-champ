import { useCallback, useEffect, useState, useMemo } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { canHeroRebuy } from "@/features/table/lib/rebuyEligibility";

export function useRebuySheet(
  tableId: string,
  snapshot: TableSnapshotPayload | undefined,
  refreshBankroll: () => Promise<void>
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (snapshot?.hand || !snapshot) setVisible(false);
  }, [snapshot]);

  const canRebuy = useMemo(() => canHeroRebuy(snapshot), [snapshot]);

  const defaultBuyInCents = useMemo(() => {
    if (!snapshot) return undefined;
    if (snapshot.table?.tournament) {
      return snapshot.table.minBuyInCents;
    }
    return undefined;
  }, [snapshot]);

  const handleRebuyApply = useCallback(
    async (buyInCents: number) => {
      try {
        await serviceRegistry.post.buyIn({ tableId, amountCents: buyInCents });
        await refreshBankroll();
        useToastStore.getState().show("Chips added to table", "success");
      } catch (e) {
        useToastStore.getState().show((e as Error).message ?? "Rebuy failed", "danger");
      }
    },
    [tableId, refreshBankroll]
  );

  return {
    rebuySheetVisible: visible,
    setRebuySheetVisible: setVisible,
    canRebuy,
    defaultBuyInCents,
    handleRebuyApply,
  };
}
