import { PrismaClient } from '@prisma/client';
import { MembershipService } from './memberships.js';
import { MONETIZATION_FEATURES, CONTENT_GATING, ContentType, RequiredTier } from '../config/features.js';

const prisma = new PrismaClient();

export interface ContentAccessResult {
  hasAccess: boolean;
  isPremium: boolean;
  requiredTier?: RequiredTier;
  previewPercentage?: number;
  reason?: string;
}

export interface ContentAccessConfig {
  contentId: string;
  type: ContentType;
  userId?: string;
}

export class ContentAccessService {
  private static asRequiredTier(value: string | null | undefined): RequiredTier | undefined {
    if (value == null) return undefined;
    if (value === 'lifetime' || value === 'premium' || value === 'pro') return value;
    return undefined;
  }

  /**
   * Bulk check access for many content IDs (e.g. lesson list). Single membership lookup + single contentAccess query.
   */
  static async bulkCheckContentAccess(
    userId: string,
    contentIds: string[],
    type: ContentType,
  ): Promise<Map<string, ContentAccessResult>> {
    const map = new Map<string, ContentAccessResult>();
    if (contentIds.length === 0) return map;
    if (!MONETIZATION_FEATURES.PAY_GATING_ENABLED) {
      for (const id of contentIds) {
        map.set(id, { hasAccess: true, isPremium: false, reason: 'Pay gating is disabled' });
      }
      return map;
    }
    const [accessRows, membership] = await Promise.all([
      prisma.contentAccess.findMany({
        where: { contentId: { in: contentIds }, type },
      }),
      MembershipService.getUserMembership(userId),
    ]);
    const accessByContentId = new Map(accessRows.map((r) => [r.contentId, r]));
    const hasPremiumAccess = membership?.status === 'active';
    for (const contentId of contentIds) {
      const contentAccess = accessByContentId.get(contentId);
      if (!contentAccess || !contentAccess.isPremium) {
        map.set(contentId, { hasAccess: true, isPremium: false, reason: 'Content is not premium' });
        continue;
      }
      if (hasPremiumAccess && this.checkTierRequirement(membership!.type, this.asRequiredTier(contentAccess.requiredTier))) {
        map.set(contentId, {
          hasAccess: true,
          isPremium: true,
          requiredTier: this.asRequiredTier(contentAccess.requiredTier),
          reason: 'Active premium membership',
        });
      } else {
        map.set(contentId, {
          hasAccess: false,
          isPremium: true,
          requiredTier: this.asRequiredTier(contentAccess.requiredTier),
          previewPercentage: CONTENT_GATING.previewPercentage,
          reason: hasPremiumAccess ? `Requires ${contentAccess.requiredTier} membership` : 'Premium content requires membership',
        });
      }
    }
    return map;
  }

  static async checkContentAccess(config: ContentAccessConfig): Promise<ContentAccessResult> {
    // If pay gating is disabled, everyone has access
    if (!MONETIZATION_FEATURES.PAY_GATING_ENABLED) {
      return {
        hasAccess: true,
        isPremium: false,
        reason: 'Pay gating is disabled',
      };
    }

    // Get content access rules
    const contentAccess = await prisma.contentAccess.findUnique({
      where: {
        contentId_type: {
          contentId: config.contentId,
          type: config.type,
        },
      },
    });

    // If no access rules exist, content is free
    if (!contentAccess || !contentAccess.isPremium) {
      return {
        hasAccess: true,
        isPremium: false,
        reason: 'Content is not premium',
      };
    }

    // Check user membership if userId provided
    if (config.userId) {
      const membership = await MembershipService.getUserMembership(config.userId);
      const hasPremiumAccess = membership?.status === 'active';

      if (hasPremiumAccess) {
        // Check if user's membership tier meets requirements
        const meetsTierRequirement = this.checkTierRequirement(
          membership.type,
          this.asRequiredTier(contentAccess.requiredTier)
        );

        if (meetsTierRequirement) {
          return {
            hasAccess: true,
            isPremium: true,
            requiredTier: this.asRequiredTier(contentAccess.requiredTier),
            reason: 'Active premium membership',
          };
        } else {
          return {
            hasAccess: false,
            isPremium: true,
            requiredTier: this.asRequiredTier(contentAccess.requiredTier),
            previewPercentage: CONTENT_GATING.previewPercentage,
            reason: `Requires ${contentAccess.requiredTier} membership`,
          };
        }
      }
    }

    // User doesn't have access - return preview info
    return {
      hasAccess: false,
      isPremium: true,
      requiredTier: this.asRequiredTier(contentAccess.requiredTier),
      previewPercentage: CONTENT_GATING.previewPercentage,
      reason: 'Premium content requires membership',
    };
  }

  static async setContentAccessRules(
    contentId: string,
    type: ContentType,
    isPremium: boolean,
    requiredTier?: RequiredTier
  ) {
    try {
      const result = await prisma.contentAccess.upsert({
        where: {
          contentId_type: {
            contentId,
            type,
          },
        },
        update: {
          isPremium,
          requiredTier,
        },
        create: {
          contentId,
          type,
          isPremium,
          requiredTier,
        },
      });

      return { success: true, contentAccess: result };
    } catch (error) {
      console.error('Failed to set content access rules:', error);
      return { success: false, error: 'Failed to update content access rules' };
    }
  }

  static async getPremiumContent(type?: ContentType) {
    try {
      const whereClause = {
        isPremium: true,
        ...(type && { type }),
      };

      const premiumContent = await prisma.contentAccess.findMany({
        where: whereClause,
        orderBy: {
          contentId: 'asc',
        },
      });

      return premiumContent;
    } catch (error) {
      console.error('Failed to get premium content:', error);
      throw new Error('Failed to retrieve premium content');
    }
  }

  static async getContentAccessStats() {
    try {
      const totalContent = await prisma.contentAccess.count();
      const premiumContent = await prisma.contentAccess.count({
        where: { isPremium: true },
      });

      const contentByType = await prisma.contentAccess.groupBy({
        by: ['type', 'isPremium'],
        _count: {
          id: true,
        },
      });

      return {
        totalContent,
        premiumContent,
        freeContent: totalContent - premiumContent,
        contentByType,
      };
    } catch (error) {
      console.error('Failed to get content access stats:', error);
      throw new Error('Failed to retrieve content access stats');
    }
  }

  static async bulkUpdateContentAccess(updates: Array<{
    contentId: string;
    type: ContentType;
    isPremium: boolean;
    requiredTier?: RequiredTier;
  }>) {
    try {
      const results = await Promise.all(
        updates.map(update =>
          this.setContentAccessRules(
            update.contentId,
            update.type,
            update.isPremium,
            update.requiredTier
          )
        )
      );

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: failureCount === 0,
        successCount,
        failureCount,
        results,
      };
    } catch (error) {
      console.error('Failed to bulk update content access:', error);
      return { success: false, error: 'Bulk update failed' };
    }
  }

  private static checkTierRequirement(
    membershipType: string,
    requiredTier?: RequiredTier
  ): boolean {
    if (!requiredTier) return true;

    // Define tier hierarchy
    const tierHierarchy = {
      'lifetime': 3,
      'premium': 2,
      'pro': 1,
    };

    const userTierLevel = tierHierarchy[membershipType as keyof typeof tierHierarchy] || 0;
    const requiredTierLevel = tierHierarchy[requiredTier] || 0;

    return userTierLevel >= requiredTierLevel;
  }

  static async getFreeContentLimit(type: ContentType): Promise<number> {
    // Return the number of free items available for this content type
    // This can be extended to be more sophisticated based on your needs
    
    switch (type) {
      case 'lesson':
        return CONTENT_GATING.defaultFreeLessons;
      case 'section':
        return 3; // First 3 sections free
      case 'feature':
        return 5; // First 5 features free
      default:
        return 0;
    }
  }

  static async getUserFreeContentAccess(
    userId: string,
    type: ContentType
  ): Promise<string[]> {
    // Get list of content IDs this user can access for free
    // This implements the "first N items are free" logic
    
    const freeLimit = await this.getFreeContentLimit(type);
    
    const allContent = await prisma.contentAccess.findMany({
      where: { type },
      orderBy: { contentId: 'asc' },
      take: freeLimit,
      select: { contentId: true },
    });

    return allContent.map(c => c.contentId);
  }
}
