import { classifyConnectFailure } from "@/realtime/transport";

/** Errors where a fresh tournament ensure-table + room id may fix the join. */
export function isRecoverableTableJoinFailure(message: string | undefined): boolean {
  if (!message || message.trim().length === 0) return false;
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("table no longer exists") || normalized.includes("table_gone")) {
    return true;
  }
  if (classifyConnectFailure(message) === "terminal") {
    if (normalized.includes("insufficient bankroll") || normalized.includes("missing_buy_in")) {
      return false;
    }
    if (normalized.includes("unauthorized") || normalized.includes("authentication required")) {
      return false;
    }
    return true;
  }
  if (normalized.includes("room \"") && normalized.includes("not found")) return true;
  if (normalized.includes("has been disposed")) return true;
  if (normalized.includes("session expired")) return true;
  return false;
}
