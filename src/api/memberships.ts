import { PrismaClient } from '@prisma/client';
import { MONETIZATION_FEATURES, MEMBERSHIP_PRICING, MembershipStatus, MembershipType } from '../config/features.js';
import { createRequire } from 'node:module';

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);
type StripeEvent = { type: string; data: { object: unknown } };
type StripeCheckoutSession = any;
type StripePaymentIntent = any;

let stripeClient: any | null = null;
function getStripeClient() {
  if (stripeClient) return stripeClient;
  try {
    const StripeCtor = require('stripe');
    stripeClient = new StripeCtor(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-11-20.acacia',
    });
    return stripeClient;
  } catch {
    throw new Error('Stripe SDK is not installed. Run pnpm add stripe.');
  }
}

export interface MembershipData {
  userId: string;
  type: MembershipType;
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
}

export interface CreateMembershipResult {
  success: boolean;
  membership?: { id: string; userId: string; type: string; status: string };
  error?: string;
}

export class MembershipService {
  static async createMembership(data: MembershipData): Promise<CreateMembershipResult> {
    if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
      return { success: false, error: 'Membership purchases are not enabled' };
    }

    try {
      // Check if user already has an active membership
      const existingMembership = await prisma.membership.findUnique({
        where: { userId: data.userId },
      });

      if (existingMembership && existingMembership.status === 'active') {
        return { success: false, error: 'User already has an active membership' };
      }

      // Create new membership
      const membership = await prisma.membership.create({
        data: {
          userId: data.userId,
          stripeId: data.stripeCustomerId,
          type: data.type,
          status: 'active',
          purchasedAt: new Date(),
          // Lifetime memberships don't expire
          expiresAt: data.type === 'lifetime' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });

      return { success: true, membership };
    } catch (error) {
      console.error('Failed to create membership:', error);
      return { success: false, error: 'Failed to create membership' };
    }
  }

  static async getUserMembership(userId: string) {
    try {
      const membership = await prisma.membership.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      });

      if (!membership) {
        return null;
      }

      // Check if membership is expired
      if (membership.expiresAt && membership.expiresAt < new Date()) {
        await this.updateMembershipStatus(membership.id, 'expired');
        return { ...membership, status: 'expired' };
      }

      return membership;
    } catch (error) {
      console.error('Failed to get user membership:', error);
      throw new Error('Failed to retrieve membership');
    }
  }

  static async updateMembershipStatus(membershipId: string, status: MembershipStatus) {
    try {
      await prisma.membership.update({
        where: { id: membershipId },
        data: { 
          status,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to update membership status:', error);
      throw new Error('Failed to update membership status');
    }
  }

  static async createStripeCheckoutSession(userId: string, userEmail: string) {
    if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
      throw new Error('Membership purchases are not enabled');
    }

    try {
      // Get or create Stripe customer
      let customerId: string;
      const existingMembership = await prisma.membership.findUnique({
        where: { userId },
      });

      if (existingMembership?.stripeId) {
        customerId = existingMembership.stripeId;
      } else {
        const stripe = getStripeClient();
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId,
          },
        });
        customerId = customer.id;
      }

      // Create checkout session
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: MEMBERSHIP_PRICING.LIFETIME.currency,
              product_data: {
                name: MEMBERSHIP_PRICING.LIFETIME.name,
                description: MEMBERSHIP_PRICING.LIFETIME.description,
              },
              unit_amount: MEMBERSHIP_PRICING.LIFETIME.amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.STRIPE_CANCEL_URL!,
        metadata: {
          userId,
          membershipType: 'lifetime',
        },
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
      });

      return { success: true, sessionId: session.id, url: session.url };
    } catch (error) {
      console.error('Failed to create Stripe checkout session:', error);
      return { success: false, error: 'Failed to create checkout session' };
    }
  }

  static async handleWebhookEvent(event: StripeEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutSessionCompleted(event.data.object as StripeCheckoutSession);
      
      case 'payment_intent.succeeded':
        return this.handlePaymentIntentSucceeded(event.data.object as StripePaymentIntent);
      
      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
        return { success: true, message: 'Event acknowledged' };
    }
  }

  private static async handleCheckoutSessionCompleted(session: StripeCheckoutSession) {
    try {
      const userId = session.metadata?.userId;
      const membershipType = session.metadata?.membershipType;
      const customerId = session.customer as string;

      if (!userId || !membershipType) {
        console.error('Missing required metadata in checkout session');
        return { success: false, error: 'Missing required metadata' };
      }

      // Create or update membership
      const result = await this.createMembership({
        userId,
        type: membershipType as MembershipType,
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: session.id,
      });

      if (result.success) {
        console.log(`Membership created for user ${userId}`);
        await this.recordMembershipRevenue(session);
        return { success: true, membership: result.membership };
      } else {
        console.error('Failed to create membership from webhook:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error handling checkout session completed:', error);
      return { success: false, error: 'Webhook processing failed' };
    }
  }

  private static async recordMembershipRevenue(session: StripeCheckoutSession): Promise<void> {
    const userId = session.metadata?.userId;
    const amountTotal = session.amount_total;
    if (!userId || amountTotal == null) return;

    const externalRef = session.id;
    const existing = await prisma.balanceTransaction.findUnique({
      where: { externalRef },
    });
    if (existing) return;

    await prisma.balanceTransaction.create({
      data: {
        id: `mem_${externalRef}`,
        userId,
        amountCents: amountTotal,
        type: 'MEMBERSHIP_PURCHASE',
        externalRef,
        metaJson: { stripeSessionId: session.id },
      },
    });
  }

  private static async handlePaymentIntentSucceeded(paymentIntent: StripePaymentIntent) {
    try {
      // Payment intents are handled primarily by checkout.session.completed
      // This is mainly for logging and additional processing if needed
      console.log(`Payment intent succeeded: ${paymentIntent.id}`);
      return { success: true, message: 'Payment intent processed' };
    } catch (error) {
      console.error('Error handling payment intent succeeded:', error);
      return { success: false, error: 'Payment intent processing failed' };
    }
  }

  static async getMembershipAnalytics() {
    try {
      const totalMemberships = await prisma.membership.count();
      const activeMemberships = await prisma.membership.count({
        where: { status: 'active' },
      });
      
      const lifetimeMemberships = await prisma.membership.count({
        where: { type: 'lifetime' },
      });

      const recentMemberships = await prisma.membership.findMany({
        take: 10,
        orderBy: { purchasedAt: 'desc' },
        include: {
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      });

      const totalRevenue = await prisma.balanceTransaction.aggregate({
        where: {
          type: 'MEMBERSHIP_PURCHASE',
        },
        _sum: {
          amountCents: true,
        },
      });

      return {
        totalMemberships,
        activeMemberships,
        lifetimeMemberships,
        totalRevenue: totalRevenue._sum.amountCents || 0,
        recentMemberships,
      };
    } catch (error) {
      console.error('Failed to get membership analytics:', error);
      throw new Error('Failed to retrieve membership analytics');
    }
  }
}
