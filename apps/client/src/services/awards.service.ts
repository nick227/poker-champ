import { request } from "@poker-champ/sdk";

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

export async function getMyAwards(): Promise<{ items: UserAwardItem[] }> {
  return request<{ items: UserAwardItem[] }>("GET", "/api/awards/me");
}

function parseGraphic(graphic: string): string {
  if (graphic.startsWith("emoji:")) return graphic.slice(6);
  return graphic;
}

export { parseGraphic };
