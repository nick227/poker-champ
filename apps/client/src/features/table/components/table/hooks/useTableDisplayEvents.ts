import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionNotice, TableDisplayEvents } from "../table.types";
import {
  buildActionMessage,
  buildWinnerBannerFromSnapshot,
} from "../displayMessages";

function buildActionNotice(
  snapshot: TableSnapshotPayload | undefined,
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
    message: buildActionMessage(lastAction, actorName),
  };
}

export function useTableDisplayEvents(
  _tableId: string,
  snapshot: TableSnapshotPayload | undefined,
): TableDisplayEvents {
  return useMemo(
    () => ({
      actionNotice: buildActionNotice(snapshot),
      winnerBanner: buildWinnerBannerFromSnapshot(snapshot),
    }),
    [snapshot],
  );
}
