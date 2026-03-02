// Monetization feature flags and configuration

export const MONETIZATION_FEATURES = {
  PAY_GATING_ENABLED: process.env.ENABLE_PAY_GATING === 'true',
  TIPS_ENABLED: true,
  MEMBERSHIP_PURCHASE_ENABLED: process.env.ENABLE_MEMBERSHIP_PURCHASE === 'true',
  PREMIUM_PRICE: process.env.PREMIUM_PRICE || '200.00',
  FOUNDING_MEMBER_PRICING: process.env.FOUNDING_MEMBER_PRICING === 'true',
} as const;

export const MEMBERSHIP_PRICING = {
  LIFETIME: {
    amount: 20000, // $200.00 in cents
    currency: 'usd',
    name: 'Lifetime Membership',
    description: 'Lock in permanent access to a growing poker training program'
  }
} as const;

export const CONTENT_GATING = {
  enabled: process.env.ENABLE_CONTENT_GATING === 'true',
  defaultFreeLessons: 5, // First 5 lessons always free
  previewPercentage: 0.3, // 30% of premium content preview
  foundingMemberPricing: process.env.FOUNDING_MEMBER_PRICING === 'true'
} as const;

export const STRIPE_CONFIG = {
  PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  SUCCESS_URL: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/success',
  CANCEL_URL: process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/cancel',
} as const;

// Type definitions for membership system
export type MembershipStatus = 'active' | 'cancelled' | 'expired';
export type MembershipType = 'lifetime' | 'monthly' | 'annual';
export type ContentType = 'lesson' | 'section' | 'feature';
export type RequiredTier = 'lifetime' | 'premium' | 'pro';

export interface Membership {
  id: string;
  userId: string;
  stripeId?: string;
  type: MembershipType;
  status: MembershipStatus;
  purchasedAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentAccess {
  id: string;
  contentId: string;
  type: ContentType;
  isPremium: boolean;
  requiredTier?: RequiredTier;
}

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}
