import { request } from "@poker-champ/sdk";
import { withApiError } from "./_helpers/withApiError";
import type { ServiceResult } from "./_helpers/serviceTypes";

export type UserAwardItem = {
  awardId: string;
  name: string;
  graphic: string;
  tier: string;
  tierWeight: number;
  priorityWeight: number;
  category?: string;
  reason: string;
  earnedAt: string;
  lastEarnedAt: string;
  count: number;
  contextType: string | null;
  contextId: string | null;
};

export async function getMyAwards(): Promise<ServiceResult<{ items: UserAwardItem[] }>> {
  return withApiError(() => request<{ items: UserAwardItem[] }>("GET", "/api/awards/me"));
}

function parseGraphic(graphic: string): string {
  if (graphic.startsWith("emoji:")) return graphic.slice(6);
  return graphic;
}

export { parseGraphic };
