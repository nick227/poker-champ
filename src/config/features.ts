export function isPersistentSeatsEnabled(): boolean {
  return process.env.FEATURE_PERSISTENT_SEATS === "true";
}

export function isTableSnapshotLogPersistenceEnabled(): boolean {
  // Replay depends on snapshot logs; default this to enabled and allow explicit opt-out.
  return process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE !== "false";
}

export function isLeaderboardEnabled(): boolean {
  const value = process.env.ENABLE_LEADERBOARD;
  if (value == null) return true;
  return value === "true";
}

export function isLessonsV1Enabled(): boolean {
  return process.env.ENABLE_LESSONS_V1 === "true";
}

// Monetization (server uses this file; root config/features.ts is for client/reference)
export const MONETIZATION_FEATURES = {
  PAY_GATING_ENABLED: process.env.ENABLE_PAY_GATING === "true",
  TIPS_ENABLED: true,
  MEMBERSHIP_PURCHASE_ENABLED: process.env.ENABLE_MEMBERSHIP_PURCHASE === "true",
  PREMIUM_PRICE: process.env.PREMIUM_PRICE || "200.00",
  FOUNDING_MEMBER_PRICING: process.env.FOUNDING_MEMBER_PRICING === "true",
} as const;

export const MEMBERSHIP_PRICING = {
  LIFETIME: {
    amount: 20000,
    currency: "usd",
    name: "Lifetime Membership",
    description: "Lock in permanent access to a growing poker training program",
  },
} as const;

export const CONTENT_GATING = {
  enabled: process.env.ENABLE_CONTENT_GATING === "true",
  defaultFreeLessons: 5,
  previewPercentage: 0.3,
  foundingMemberPricing: process.env.FOUNDING_MEMBER_PRICING === "true",
} as const;

export const STRIPE_CONFIG = {
  PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
  SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  SUCCESS_URL: process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/success",
  CANCEL_URL: process.env.STRIPE_CANCEL_URL || "http://localhost:3000/cancel",
} as const;

export type MembershipStatus = "active" | "cancelled" | "expired";
export type MembershipType = "lifetime" | "monthly" | "annual";
export type ContentType = "lesson" | "section" | "feature";
export type RequiredTier = "lifetime" | "premium" | "pro";
