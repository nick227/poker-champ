import { useCallback, useEffect, useRef } from "react";
import { getMyAwards } from "@/services/awards.service";
import type { UserAwardItem } from "@/services/awards.service";
import type { AwardGrant } from "@/types/awards";
import { useAwardsToastStore } from "@/stores/awardsToast.store";

const POLL_MS = 45_000;

function toGrant(item: UserAwardItem): AwardGrant {
  return {
    awardId: item.awardId,
    name: item.name,
    graphic: item.graphic,
    tier: item.tier as AwardGrant["tier"],
    tierWeight: item.tierWeight,
    priorityWeight: item.priorityWeight,
    reason: item.reason,
    ...(item.contextType && { contextType: item.contextType as AwardGrant["contextType"] }),
    ...(item.contextId && { contextId: item.contextId }),
  };
}

export function useTableAwardsToast(isAtTable: boolean) {
  const lastSeenTs = useRef<number>(0);
  const firstFetchDone = useRef(false);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  /** Watermark = max(lastEarnedAt); new = items where lastEarnedAt > watermark. Not count-based (avoids double-toast). */
  const fetchAndShowNew = useCallback(async () => {
    const res = await getMyAwards();
    if (!res.ok) return;
    const { items } = res.data;
    if (cancelledRef.current) return;
    const maxTs = Math.max(0, ...items.map((i) => new Date(i.lastEarnedAt).getTime()));
    if (!firstFetchDone.current) {
      lastSeenTs.current = maxTs;
      firstFetchDone.current = true;
      return;
    }
    const newItems = items.filter((i) => new Date(i.lastEarnedAt).getTime() > lastSeenTs.current);
    if (maxTs > lastSeenTs.current) lastSeenTs.current = maxTs;
    if (newItems.length > 0 && !cancelledRef.current) {
      useAwardsToastStore.getState().show(newItems.map(toGrant));
    }
  }, []);

  useEffect(() => {
    if (!isAtTable) return;
    cancelledRef.current = false;
    void fetchAndShowNew();
    intervalId.current = setInterval(() => void fetchAndShowNew(), POLL_MS);
    return () => {
      cancelledRef.current = true;
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
      void fetchAndShowNew();
    };
  }, [isAtTable, fetchAndShowNew]);
}
