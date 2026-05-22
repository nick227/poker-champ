import { request } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";

export type CashTableResumeStatus =
  | "READY"
  | "ROOM_RECOVERED"
  | "NEEDS_BUY_IN"
  | "NOT_SEATED"
  | "ENDED"
  | "FAILED";

export type CashTableResumeResult = {
  tableId: string;
  roomId: string | null;
  tableLive: boolean;
  resumeStatus: CashTableResumeStatus;
  playerStatus: "SEATED" | "NOT_SEATED";
  seatSessionState?: "SEATED_ACTIVE" | "SEATED_SITTING_OUT" | "LEFT" | null;
  stackCentsSnapshot?: number | null;
  minBuyInCents?: number;
  maxBuyInCents?: number;
  recoveryReason?: string;
};

export async function postCashTableResume(
  tableId: string,
  options?: { roomId?: string },
): Promise<CashTableResumeResult> {
  const res = await withApiError(() =>
    request<CashTableResumeResult>("POST", `/api/tables/${tableId}/resume`, options?.roomId ? { roomId: options.roomId } : {}),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
