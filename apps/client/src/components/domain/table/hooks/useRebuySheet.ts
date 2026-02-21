import { useCallback, useEffect, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export function useRebuySheet(
  tableId: string,
  snapshot: TableSnapshotPayload | undefined,
  refreshBankroll: () => Promise<void>
) {
  const [visible, setVisible] = useState(false);

  const hasActiveHand = Boolean(snapshot?.hand);
  const hasSnapshot = Boolean(snapshot);

  useEffect(() => {
    if (hasActiveHand || !hasSnapshot) setVisible(false);
  }, [hasActiveHand, hasSnapshot]);

  const heroSeat =
    snapshot?.hero.seat != null
      ? snapshot.seats.find((s) => s.seat === snapshot.hero.seat)
      : undefined;
  const canRebuy =
    Boolean(snapshot?.hero.youAreSeated) &&
    (heroSeat?.stackCents ?? 0) === 0 &&
    Number.isInteger(snapshot?.table?.minBuyInCents) &&
    Number(snapshot?.table?.minBuyInCents) > 0 &&
    Number.isInteger(snapshot?.table?.maxBuyInCents) &&
    Number(snapshot?.table?.maxBuyInCents) > 0;

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
