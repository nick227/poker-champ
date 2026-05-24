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

    const tournamentViewer = snapshot.hero.tournamentViewer;
    if (snapshot.table?.tournament) {
      return tournamentViewer?.rebuyPending === true;
    }

    if (tournamentViewer?.isEliminated) return false;

    if (!snapshot.hero.youAreSeated) return false;

    const heroSeat =
      snapshot.hero.seat != null
        ? snapshot.seats.find((s) => s.seat === snapshot.hero.seat)
        : undefined;

    if (!heroSeat) return false;

    if (heroSeat.stackCents !== 0) return false;
    const allowedBustedStatuses = ["WAITING", "OUT", "ABANDONED", "ALL_IN"];
    if (!allowedBustedStatuses.includes(heroSeat.status)) return false;

    const { minBuyInCents, maxBuyInCents } = snapshot.table;
    if (!Number.isInteger(minBuyInCents) || minBuyInCents <= 0) return false;
    if (!Number.isInteger(maxBuyInCents) || maxBuyInCents <= 0) return false;

    return true;
  }, [snapshot]);

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
