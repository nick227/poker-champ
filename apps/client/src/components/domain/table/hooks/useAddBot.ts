import { useCallback, useEffect, useRef, useState } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

const ADD_BOT_PENDING_MS = 2500;

export type UseAddBotParams = {
  tableId: string;
  buyInCents: number | undefined;
  dispatchAddBot: (payload: { tableId: string; buyInCents: number }) => void;
  snapshot: TableSnapshotPayload | undefined;
};

export function useAddBot(params: UseAddBotParams): {
  addBotPending: boolean;
  handleAddBot: () => void;
} {
  const { tableId, buyInCents, dispatchAddBot, snapshot } = params;
  const [addBotPending, setAddBotPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSeatCountRef = useRef(0);
  const prevHadHandRef = useRef(false);

  const handleAddBot = useCallback(() => {
    setAddBotPending(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    dispatchAddBot({ tableId, buyInCents: buyInCents ?? 0 });
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setAddBotPending(false);
    }, ADD_BOT_PENDING_MS);
  }, [tableId, buyInCents, dispatchAddBot]);

  useEffect(() => {
    if (!snapshot) return;
    const seatCount = snapshot.seats?.length ?? 0;
    const hasHand = Boolean(snapshot.hand);
    const prevSeatCount = prevSeatCountRef.current;
    const prevHadHand = prevHadHandRef.current;
    prevSeatCountRef.current = seatCount;
    prevHadHandRef.current = hasHand;
    if (addBotPending && (seatCount > prevSeatCount || (hasHand && !prevHadHand))) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setAddBotPending(false);
    }
  }, [addBotPending, snapshot]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return { addBotPending, handleAddBot };
}
