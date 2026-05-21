/**
 * Cross-layer contract: bulkGrant result.granted, LessonsRouter awardsGranted[], client toaster.
 * Client consumes this directly; do not reconstruct from catalog.
 */
export type AwardGrant = {
  awardId: string;
  name: string;
  graphic: string;
  tier: "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
  tierWeight: number;
  priorityWeight: number;
  reason: string;
  contextType?: "LESSON" | "HAND" | "REPLAY" | "SESSION" | "TOURNAMENT";
  contextId?: string;
};

export type BulkGrantResult = {
  granted: AwardGrant[];
  skipped: string[];
};

/** Candidate for grant: awardId + resolved reason + optional context. triggerKey only for REPEATABLE trigger-scoped awards. */
export type GrantCandidate = {
  awardId: string;
  reason: string;
  contextType?: "LESSON" | "HAND" | "REPLAY" | "SESSION" | "TOURNAMENT";
  contextId?: string;
  triggerKey?: string;
};

export type AwardTier = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
export type AwardSource = "LESSON" | "TABLE" | "REPLAY" | "SYSTEM" | "TOURNAMENT";
export type AwardEarnType = "ONE_TIME" | "REPEATABLE";

export type AwardCatalogEntry = {
  id: string;
  name: string;
  reasonTemplate: string;
  graphic: string;
  tier: AwardTier;
  tierWeight: number;
  priorityWeight: number;
  earnType: AwardEarnType;
  source: AwardSource;
  category: string;
  version: number;
};

export const TIER_WEIGHT: Record<AwardTier, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  LEGENDARY: 4,
};
