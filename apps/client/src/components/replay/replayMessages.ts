import type { TableLastAction, TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { HandResultMessage } from "@/components/domain/table/table.types";
import { formatCents } from "@/lib/format";

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

export function getReplayActionMessage(snapshot: TableSnapshotPayload): string | undefined {
  const lastAction = snapshot.lastAction;
  if (!lastAction) return undefined;
  const actorName =
    snapshot.seats.find((seat) => seat.userId === lastAction.actorUserId)?.name ??
    (lastAction.actorKind === "BOT" ? "Bot" : "Player");
  return buildActionMessage(lastAction, actorName);
}

export function getReplayHandResultMessage(
  snapshot: TableSnapshotPayload,
): HandResultMessage | undefined {
  const result = snapshot.lastHandResult;
  if (!result) return undefined;

  const winnerId = result.winnerId ?? Object.keys(result.payoutsByUserId ?? {})[0];
  const winnerName = winnerId
    ? snapshot.seats.find((seat) => seat.userId === winnerId)?.name ?? "Winner"
    : "Split pot";
  const amountCents =
    winnerId && result.payoutsByUserId
      ? result.payoutsByUserId[winnerId] ?? result.potCents
      : result.potCents;

  return {
    winnerName,
    amountCents,
    winningHandDescr: result.winningHandDescr,
  };
}
