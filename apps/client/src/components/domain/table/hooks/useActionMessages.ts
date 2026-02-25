import { useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/format";
import type { TableLastAction } from "@poker-champ/realtime-contract";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type HandResultMessage = {
  winnerName: string;
  amountCents: number;
  winningHandDescr?: string;
};

function buildActionMessage(action: TableLastAction, actorName: string): string {
  const originSuffix =
    action.origin === "AUTO"
      ? " (auto)"
      : action.origin === "FORCED"
        ? " (forced)"
        : "";

  switch (action.action) {
    case "FOLD":
      return `${actorName} folds${originSuffix}`;
    case "CHECK":
      return `${actorName} checks${originSuffix}`;
    case "CALL":
      return `${actorName} calls ${formatCents(action.amountCents)}${originSuffix}`;
    case "BET":
      return `${actorName} bets ${formatCents(action.amountCents)}${originSuffix}`;
    case "RAISE":
      return action.raiseToCents != null
        ? `${actorName} raises to ${formatCents(action.raiseToCents)}${originSuffix}`
        : `${actorName} raises ${formatCents(action.amountCents)}${originSuffix}`;
    case "ALL_IN":
      return `${actorName} is all-in for ${formatCents(action.amountCents)}${originSuffix}`;
    default:
      return "";
  }
}

const HAND_RESULT_DURATION_MS = 3000;

export function useActionMessages(
  tableId: string,
  snapshot: TableSnapshotPayload | undefined
): {
  actionMessage: string | null;
  handResultMessage: HandResultMessage | null;
} {
  const [lastShownActionKey, setLastShownActionKey] = useState<string | null>(null);
  const [lastShownHandResultId, setLastShownHandResultId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [handResultMessage, setHandResultMessage] = useState<HandResultMessage | null>(null);

  useEffect(() => {
    setLastShownActionKey(null);
    setActionMessage(null);
    setLastShownHandResultId(null);
    setHandResultMessage(null);
  }, [tableId]);

  const hand = snapshot?.hand;
  const lastAction = snapshot?.lastAction;
  const lastHandResult = snapshot?.lastHandResult;
  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const seat of snapshot?.seats ?? []) {
      if (seat.userId != null) {
        map.set(String(seat.userId), seat.name ?? "Player");
      }
    }
    return map;
  }, [snapshot?.seats]);

  useEffect(() => {
    if (!hand || !lastAction) {
      if (!hand) setActionMessage(null);
      return;
    }
    const key = `${lastAction.handId}:${lastAction.seq}`;
    if (key === lastShownActionKey) return;
    setLastShownActionKey(key);
    const actorName = nameByUserId.get(String(lastAction.actorUserId)) ?? (lastAction.actorKind === "BOT" ? "Bot" : "Player");
    setActionMessage(buildActionMessage(lastAction, actorName));
  }, [hand, lastAction, nameByUserId, lastShownActionKey]);

  useEffect(() => {
    if (!lastHandResult) return;
    if (lastHandResult.handId === lastShownHandResultId) return;
    setLastShownHandResultId(lastHandResult.handId);
    const winnerId = lastHandResult.winnerId ?? Object.keys(lastHandResult.payoutsByUserId ?? {})[0];
    const winnerName = winnerId ? nameByUserId.get(String(winnerId)) ?? "Winner" : "Split pot";
    const amountCents =
      winnerId && lastHandResult.payoutsByUserId
        ? lastHandResult.payoutsByUserId[winnerId] ?? lastHandResult.potCents
        : lastHandResult.potCents;
    setHandResultMessage({
      winnerName,
      amountCents,
      winningHandDescr: lastHandResult.winningHandDescr,
    });
    const t = setTimeout(() => setHandResultMessage(null), HAND_RESULT_DURATION_MS);
    return () => clearTimeout(t);
  }, [lastHandResult, nameByUserId, lastShownHandResultId]);

  useEffect(() => {
    const activeHandId = hand?.handId;
    const resultHandId = lastHandResult?.handId;
    if (!activeHandId || !handResultMessage) return;
    if (activeHandId !== resultHandId) setHandResultMessage(null);
  }, [hand?.handId, lastHandResult?.handId, handResultMessage]);

  return useMemo(
    () => ({ actionMessage, handResultMessage }),
    [actionMessage, handResultMessage]
  );
}
