/** Client-safe monetization flags (from EXPO_PUBLIC_* or env). */
export const MONETIZATION_FEATURES = {
  PAY_GATING_ENABLED: process.env.EXPO_PUBLIC_ENABLE_PAY_GATING === "true",
  TIPS_ENABLED: true,
  MEMBERSHIP_PURCHASE_ENABLED:
    process.env.EXPO_PUBLIC_ENABLE_MEMBERSHIP_PURCHASE === "true",
  PREMIUM_PRICE: process.env.EXPO_PUBLIC_PREMIUM_PRICE || "200.00",
  FOUNDING_MEMBER_PRICING:
    process.env.EXPO_PUBLIC_FOUNDING_MEMBER_PRICING === "true",
} as const;
