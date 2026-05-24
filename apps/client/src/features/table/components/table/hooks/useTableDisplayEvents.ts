import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionNotice, TableDisplayEvents } from "../table.types";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import {
  buildActionMessage,
  buildWinnerBannerFromSnapshot,
} from "../displayMessages";

export function buildTableActionNotice(
  snapshot: TableSnapshotPayload | undefined,
  formatAmount: (amount: number) => string,
): ActionNotice | null {
  const hand = snapshot?.hand;
  const lastAction = snapshot?.lastAction;
  if (!hand || !lastAction || lastAction.handId !== hand.handId) {
    return null;
  }

  const actorName =
    snapshot.seats.find((seat) => String(seat.userId) === String(lastAction.actorUserId))?.name ??
    (lastAction.actorKind === "BOT" ? "Bot" : "Player");
  return {
    key: `${lastAction.handId}:${lastAction.seq}`,
    handId: lastAction.handId,
    actorUserId: lastAction.actorUserId ? String(lastAction.actorUserId) : undefined,
    message: buildActionMessage(lastAction, actorName, { formatAmount }),
  };
}

export function useTableDisplayEvents(
  _tableId: string,
  snapshot: TableSnapshotPayload | undefined,
): TableDisplayEvents {
  const { formatBet } = useTableMoneyDisplay();
  return useMemo(
    () => ({
      actionNotice: buildTableActionNotice(snapshot, formatBet),
      winnerBanner: buildWinnerBannerFromSnapshot(snapshot),
    }),
    [formatBet, snapshot],
  );
}
