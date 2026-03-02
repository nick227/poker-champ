/** Matches server AwardGrant; used in step submit response and GET /api/awards/me */
export type AwardGrant = {
  awardId: string;
  name: string;
  graphic: string;
  tier: "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
  tierWeight: number;
  priorityWeight: number;
  reason: string;
  contextType?: "LESSON" | "HAND" | "REPLAY" | "SESSION";
  contextId?: string;
};
