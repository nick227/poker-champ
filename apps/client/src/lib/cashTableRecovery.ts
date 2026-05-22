import type { CashTableResumeResult, CashTableResumeStatus } from "@/services/post/tables.resume";

export type CashTableResumeReconnectOutcome = {
  kind: "reconnect";
  roomId: string;
  buyInCents?: number;
};

export type CashTableResumeBlockedOutcome = {
  kind: "blocked";
  message: string;
};

export type CashTableResumeOutcome = CashTableResumeReconnectOutcome | CashTableResumeBlockedOutcome;

const RECONNECT_STATUSES: CashTableResumeStatus[] = ["READY", "ROOM_RECOVERED"];

export function mapCashTableResumeMessage(result: CashTableResumeResult): string {
  switch (result.resumeStatus) {
    case "ENDED":
      return "This cash table is no longer available.";
    case "FAILED":
      return result.recoveryReason === "TOURNAMENT_TABLE_USE_ENSURE_TABLE"
        ? "Use tournament join for this table."
        : "Could not resume this table.";
    case "NEEDS_BUY_IN":
      return "Buy-in required to rejoin this table.";
    case "NOT_SEATED":
      return "Your seat is no longer reserved. Rejoin from the lobby.";
    case "ROOM_RECOVERED":
      return "Table connection restored.";
    case "READY":
      return "Table is ready.";
    default:
      return "Could not resume this table.";
  }
}

export function resolveCashTableResumeOutcome(
  result: CashTableResumeResult,
  fallbackBuyInCents?: number,
): CashTableResumeOutcome {
  if (RECONNECT_STATUSES.includes(result.resumeStatus)) {
    const roomId = result.roomId;
    if (!roomId) {
      return { kind: "blocked", message: mapCashTableResumeMessage({ ...result, resumeStatus: "ENDED" }) };
    }
    return { kind: "reconnect", roomId };
  }

  if (result.resumeStatus === "NEEDS_BUY_IN") {
    const roomId = result.roomId;
    const buyIn =
      Number.isInteger(result.minBuyInCents) && Number(result.minBuyInCents) > 0
        ? Number(result.minBuyInCents)
        : Number.isInteger(fallbackBuyInCents) && Number(fallbackBuyInCents) > 0
          ? Number(fallbackBuyInCents)
          : undefined;
    if (roomId && buyIn != null) {
      return { kind: "reconnect", roomId, buyInCents: buyIn };
    }
    return { kind: "blocked", message: mapCashTableResumeMessage(result) };
  }

  return { kind: "blocked", message: mapCashTableResumeMessage(result) };
}
