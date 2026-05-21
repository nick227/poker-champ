import type { RejoinUiState } from "@/features/table";

const REJOIN_ERROR_PATTERN =
  /REJOIN_FAILED|Could not rejoin table|Connection unavailable|Connection interrupted|Connection lost|Table no longer exists/i;

export function isRejoinErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return REJOIN_ERROR_PATTERN.test(message);
}

export function mapRejoinErrorMessage(rawMessage: string | null | undefined): string {
  const message = (rawMessage ?? "").trim();
  if (!message) return "Could not rejoin table. Please retry.";
  if (/OUT_OF_CHIPS|out of chips/i.test(message)) return "Could not rejoin table. You are out of chips.";
  if (/NOT_SEATED|not seated/i.test(message)) return "Could not rejoin table. You are not seated.";
  if (/TABLE_GONE|table no longer exists/i.test(message)) return "Table no longer exists";
  if (/Connection unavailable/i.test(message)) return "Connection unavailable";
  if (/Connection interrupted/i.test(message)) return "Connection interrupted";
  if (/Connection lost/i.test(message)) return "Connection lost";
  return "Could not rejoin table. Please retry.";
}

export function resolveTableGoneForRejoin(rejoinUiState: RejoinUiState): {
  shouldCloseTable: boolean;
  nextRejoinUiState?: RejoinUiState;
  rejoinErrorMessage?: string;
} {
  if (rejoinUiState === "sending") {
    return {
      shouldCloseTable: false,
      nextRejoinUiState: "error",
      rejoinErrorMessage: "Table no longer exists",
    };
  }
  return { shouldCloseTable: true };
}

