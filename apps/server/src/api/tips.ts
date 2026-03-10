import { PrismaClient } from '@prisma/client';
import { MONETIZATION_FEATURES } from '../config/features.js';

const prisma = new PrismaClient();

export interface TipTrackingData {
  userId: string;
  amountCents: number;
  stripePaymentLinkId?: string;
  userAgent?: string;
  timestamp: Date;
}

export class TipService {
  static async trackTip(data: TipTrackingData) {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      throw new Error('Tips are not enabled');
    }

    try {
      // Store tip tracking data for analytics
      // Note: Actual payment processing is handled by Stripe Payment Links
      // This is just for tracking and analytics purposes
      
      // For now, we'll store this in BalanceTransaction table for analytics
      // In a future iteration, we might create a dedicated Tips table
      const transaction = await prisma.balanceTransaction.create({
        data: {
          id: `tip_${Date.now()}_${data.userId}`,
          userId: data.userId,
          amountCents: data.amountCents,
          type: 'TIP',
          externalRef: `tip_${Date.now()}_${data.userId}`,
          metaJson: {
            userAgent: data.userAgent,
            stripePaymentLinkId: data.stripePaymentLinkId,
            trackedAt: new Date().toISOString(),
          },
        },
      });

      return { success: true, transactionId: transaction.id };
    } catch (error) {
      console.error('Failed to track tip:', error);
      throw new Error('Failed to track tip data');
    }
  }

  static async getTipAnalytics(userId?: string) {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      return { totalTips: 0, tipCount: 0, averageTip: 0 };
    }

    const whereClause = {
      type: 'TIP',
      ...(userId && { userId }),
    };

    const tips = await prisma.balanceTransaction.findMany({
      where: whereClause,
      select: {
        amountCents: true,
        createdAt: true,
        user: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalTips = tips.reduce((sum, tip) => sum + tip.amountCents, 0);
    const tipCount = tips.length;
    const averageTip = tipCount > 0 ? totalTips / tipCount : 0;

    return {
      totalTips,
      tipCount,
      averageTip,
      recentTips: tips.slice(0, 10), // Last 10 tips
    };
  }

  static async getUserTipHistory(userId: string) {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      return [];
    }

    const tips = await prisma.balanceTransaction.findMany({
      where: {
        userId,
        type: 'TIP',
      },
      select: {
        id: true,
        amountCents: true,
        createdAt: true,
        metaJson: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return tips.map(tip => ({
      id: tip.id,
      amount: tip.amountCents,
      date: tip.createdAt,
      metadata: tip.metaJson,
    }));
  }
}
