import { tables } from "@poker-champ/sdk";
import type { components } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";

export type CashTableResumeResult = components["schemas"]["CashTableResumeResult"];
export type CashTableResumeStatus = CashTableResumeResult["resumeStatus"];

export async function postCashTableResume(
  tableId: string,
  options?: { roomId?: string },
): Promise<CashTableResumeResult> {
  const res = await withApiError(() =>
    tables.resume({ tableId }, options?.roomId ? { roomId: options.roomId } : {}),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
