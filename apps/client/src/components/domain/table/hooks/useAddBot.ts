import { useCallback, useEffect, useRef, useState } from "react";
import type { TableSnapshotPayload, BotSummary } from "@poker-champ/realtime-contract";

const ADD_BOT_PENDING_MS = 2500;

export type UseAddBotParams = {
  tableId: string;
  buyInCents: number | undefined;
  dispatchAddBot: (payload: { tableId: string; botId?: string; buyInCents: number }) => void;
  dispatchListBots: (payload: { tableId: string }) => void;
  botSummaries: BotSummary[];
  botSummariesUpdatedAtTs?: number;
  snapshot: TableSnapshotPayload | undefined;
};

export function useAddBot(params: UseAddBotParams): {
  addBotPending: boolean;
  botPickerVisible: boolean;
  botPickerLoading: boolean;
  handleAddBotPress: () => void;
  handleBotPick: (botId: string) => void;
  closeBotPicker: () => void;
} {
  const {
    tableId,
    buyInCents,
    dispatchAddBot,
    dispatchListBots,
    botSummaries: _botSummaries,
    botSummariesUpdatedAtTs,
    snapshot,
  } = params;
  const [addBotPending, setAddBotPending] = useState(false);
  const [botPickerVisible, setBotPickerVisible] = useState(false);
  const [botPickerLoading, setBotPickerLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSeatCountRef = useRef(0);
  const prevHadHandRef = useRef(false);
  const botListRequestedAtRef = useRef(0);

  const closeBotPicker = useCallback(() => {
    setBotPickerVisible(false);
    setBotPickerLoading(false);
  }, []);

  const handleAddBotPress = useCallback(() => {
    setBotPickerVisible(true);
    setBotPickerLoading(true);
    botListRequestedAtRef.current = Date.now();
    dispatchListBots({ tableId });
  }, [dispatchListBots, tableId]);

  const handleBotPick = useCallback((botId: string) => {
    setBotPickerVisible(false);
    setAddBotPending(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    dispatchAddBot({ tableId, botId, buyInCents: buyInCents ?? 0 });
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setAddBotPending(false);
    }, ADD_BOT_PENDING_MS);
  }, [tableId, buyInCents, dispatchAddBot]);

  useEffect(() => {
    if (!botPickerVisible || !botPickerLoading) return;
    if (!botSummariesUpdatedAtTs) return;
    if (botSummariesUpdatedAtTs < botListRequestedAtRef.current) return;
    setBotPickerLoading(false);
  }, [botPickerVisible, botPickerLoading, botSummariesUpdatedAtTs]);

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

  return {
    addBotPending,
    botPickerVisible,
    botPickerLoading,
    handleAddBotPress,
    handleBotPick,
    closeBotPicker,
  };
}
