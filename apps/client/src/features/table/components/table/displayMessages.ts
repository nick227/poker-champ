import type {
  TableLastAction,
  TableSnapshotPayload,
} from "@poker-champ/realtime-contract";
import type { HandResultMessage } from "./table.types";
import { formatCents } from "@/lib/format";

function getShortActorName(actorName: string): string {
  const trimmed = actorName.trim();
  if (!trimmed) return "Player";
  const [firstToken] = trimmed.split(/\s+/);
  return firstToken || "Player";
}

export function buildActionMessage(
  action: TableLastAction,
  actorName: string,
  options?: {
    shortenActorName?: boolean;
    includeOriginSuffix?: boolean;
    formatAmount?: (amount: number) => string;
  },
): string {
  const formatAmount = options?.formatAmount ?? formatCents;
  const resolvedActorName = options?.shortenActorName === false
    ? actorName
    : getShortActorName(actorName);
  const originSuffix =
    options?.includeOriginSuffix !== true
      ? ""
      : action.origin === "AUTO"
        ? " (auto)"
        : action.origin === "FORCED"
          ? " (forced)"
          : "";

  switch (action.action) {
    case "FOLD":
      return `${resolvedActorName} folds${originSuffix}`;
    case "CHECK":
      return `${resolvedActorName} checks${originSuffix}`;
    case "CALL":
      return `${resolvedActorName} calls ${formatAmount(action.amountCents)}${originSuffix}`;
    case "BET":
      return `${resolvedActorName} bets ${formatAmount(action.amountCents)}${originSuffix}`;
    case "RAISE":
      return action.raiseToCents != null
        ? `${resolvedActorName} raises to ${formatAmount(action.raiseToCents)}${originSuffix}`
        : `${resolvedActorName} raises ${formatAmount(action.amountCents)}${originSuffix}`;
    case "ALL_IN":
      return `${resolvedActorName} is all-in for ${formatAmount(action.amountCents)}${originSuffix}`;
    default:
      return "";
  }
}

export function buildWinnerMessageText(
  handResultMessage: HandResultMessage | null | undefined,
  formatAmount: (amount: number) => string = formatCents,
): string | null {
  if (!handResultMessage) {
    return null;
  }
  const base = `${handResultMessage.winnerName} wins ${formatAmount(handResultMessage.amountCents)}`;
  return handResultMessage.winningHandDescr
    ? `${base} - ${handResultMessage.winningHandDescr}`
    : base;
}

export function buildWinnerBannerFromSnapshot(
  snapshot: TableSnapshotPayload | undefined,
): HandResultMessage | null {
  const result = snapshot?.lastHandResult;
  if (!result) {
    return null;
  }

  const winnerId = result.winnerId ?? Object.keys(result.payoutsByUserId ?? {})[0];
  const winnerName = winnerId
    ? snapshot?.seats.find((seat) => String(seat.userId) === String(winnerId))?.name ?? "Winner"
    : "Split pot";
  const amountCents =
    winnerId && result.payoutsByUserId
      ? result.payoutsByUserId[winnerId] ?? result.potCents
      : result.potCents;

  return {
    handId: result.handId,
    winnerName,
    amountCents,
    winningHandDescr: result.winningHandDescr,
  };
}
