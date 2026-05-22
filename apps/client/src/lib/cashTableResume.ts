import type { CashTableResumeResult, CashTableResumeStatus } from "@/services/post/tables.resume";

const JOINABLE_RESUME_STATUSES: CashTableResumeStatus[] = [
  "READY",
  "ROOM_RECOVERED",
  "NEEDS_BUY_IN",
];

export function isCashTableResumeJoinable(status: CashTableResumeStatus): boolean {
  return JOINABLE_RESUME_STATUSES.includes(status);
}

export function mapCashTableResumeMessage(result: CashTableResumeResult): string {
  switch (result.resumeStatus) {
    case "ENDED":
      return "This table is no longer running.";
    case "FAILED":
      return result.recoveryReason === "TOURNAMENT_TABLE_USE_ENSURE_TABLE"
        ? "Use tournament join for this table."
        : "Could not resume this table.";
    case "NEEDS_BUY_IN":
      return "Buy-in required to rejoin this table.";
    case "NOT_SEATED":
      return result.recoveryReason === "SEAT_SESSION_EXPIRED"
        ? "Your seat expired. Join again with a buy-in."
        : "You are not seated at this table.";
    case "ROOM_RECOVERED":
      return "Table connection restored.";
    case "READY":
      return "Table is ready.";
    default:
      return "Could not resume this table.";
  }
}
