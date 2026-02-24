import { useCallback, useEffect, useState, useMemo } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export function useRebuySheet(
  tableId: string,
  snapshot: TableSnapshotPayload | undefined,
  refreshBankroll: () => Promise<void>
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (snapshot?.hand || !snapshot) setVisible(false);
  }, [snapshot]);

  const canRebuy = useMemo(() => {
    if (!snapshot) return false;
    if (snapshot.hand) return false;
    if (!snapshot.hero.youAreSeated) return false;

    const heroSeat =
      snapshot.hero.seat != null
        ? snapshot.seats.find((s: any) => s.seat === snapshot.hero.seat)
        : undefined;

    if (!heroSeat) return false;
    if (heroSeat.status !== "WAITING" && heroSeat.status !== "OUT") return false;
    if (heroSeat.stackCents !== 0) return false;

    const { minBuyInCents, maxBuyInCents } = snapshot.table;

    if (!Number.isInteger(minBuyInCents) || minBuyInCents <= 0) return false;
    if (!Number.isInteger(maxBuyInCents) || maxBuyInCents <= 0) return false;

    return true;
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
    handleRebuyApply,
  };
}
