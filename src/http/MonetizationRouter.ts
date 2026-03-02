import { Router, Request, Response } from 'express';
import { TipService } from '../api/tips.js';
import { MembershipService } from '../api/memberships.js';
import { ContentAccessService } from '../api/contentAccess.js';
import { MONETIZATION_FEATURES, ContentType } from '../config/features.js';
import { requireAuth } from '../engine/auth/RequireAuth.js';
import { requireContentAdmin } from './middleware/contentAccess.js';

const router = Router();
const firstString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// Tip tracking endpoint
router.post('/tips/track', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      return res.status(403).json({ error: 'Tips are not enabled' });
    }

    const { amountCents, stripePaymentLinkId } = req.body;
    const userId = req.user!.id;

    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'Invalid tip amount' });
    }

    const userAgent = req.get('User-Agent');
    
    const tipData = {
      userId,
      amountCents,
      stripePaymentLinkId,
      userAgent,
      timestamp: new Date(),
    };

    const result = await TipService.trackTip(tipData);
    
    res.json({ success: true, transactionId: result.transactionId });
  } catch (error) {
    console.error('Tip tracking error:', error);
    res.status(500).json({ error: 'Failed to track tip' });
  }
});

// Get user tip history
router.get('/tips/history', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!MONETIZATION_FEATURES.TIPS_ENABLED) {
      return res.json({ tips: [] });
    }

    const userId = req.user!.id;
    const tips = await TipService.getUserTipHistory(userId);
    
    res.json({ tips });
  } catch (error) {
    console.error('Tip history error:', error);
    res.status(500).json({ error: 'Failed to fetch tip history' });
  }
});

// Get tip analytics (admin only)
router.get('/tips/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.query;
    const analytics = await TipService.getTipAnalytics(userId as string);
    
    res.json(analytics);
  } catch (error) {
    console.error('Tip analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch tip analytics' });
  }
});

// Check monetization features status
router.get('/features/status', async (req: Request, res: Response) => {
  try {
    const features = {
      tipsEnabled: MONETIZATION_FEATURES.TIPS_ENABLED,
      payGatingEnabled: MONETIZATION_FEATURES.PAY_GATING_ENABLED,
      membershipPurchaseEnabled: MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED,
      premiumPrice: MONETIZATION_FEATURES.PREMIUM_PRICE,
      foundingMemberPricing: MONETIZATION_FEATURES.FOUNDING_MEMBER_PRICING,
    };
    
    res.json(features);
  } catch (error) {
    console.error('Feature status error:', error);
    res.status(500).json({ error: 'Failed to fetch feature status' });
  }
});

// Membership endpoints
router.post('/memberships/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!MONETIZATION_FEATURES.MEMBERSHIP_PURCHASE_ENABLED) {
      return res.status(403).json({ error: 'Membership purchases are not enabled' });
    }

    const userId = req.user!.id;
    const userEmail = req.user!.email;

    const result = await MembershipService.createStripeCheckoutSession(userId, userEmail);
    
    if (result.success) {
      res.json({ 
        success: true, 
        sessionId: result.sessionId, 
        url: result.url 
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Membership checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.get('/memberships/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const membership = await MembershipService.getUserMembership(userId);
    
    res.json({ membership });
  } catch (error) {
    console.error('Membership status error:', error);
    res.status(500).json({ error: 'Failed to fetch membership status' });
  }
});

router.get('/memberships/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const analytics = await MembershipService.getMembershipAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Membership analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch membership analytics' });
  }
});

// Stripe webhook is mounted in index.ts with express.raw() for signature verification

// Content access management endpoints (admin only)
router.post('/content/access', requireAuth, requireContentAdmin, async (req: Request, res: Response) => {
  try {
    const { contentId, type, isPremium, requiredTier } = req.body;

    if (!contentId || !type) {
      return res.status(400).json({ error: 'Content ID and type are required' });
    }

    const result = await ContentAccessService.setContentAccessRules(
      contentId,
      type,
      isPremium,
      requiredTier
    );

    if (result.success) {
      res.json({ success: true, contentAccess: result.contentAccess });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Content access management error:', error);
    res.status(500).json({ error: 'Failed to update content access rules' });
  }
});

router.get('/content/access/:contentId/:type', async (req: Request, res: Response) => {
  try {
    const contentId = firstString(req.params.contentId);
    const type = firstString(req.params.type);
    const userId = req.user?.id;
    if (!contentId || !type) {
      return res.status(400).json({ error: 'Content ID and type are required' });
    }

    const accessResult = await ContentAccessService.checkContentAccess({
      contentId,
      type: type as ContentType,
      userId,
    });

    res.json(accessResult);
  } catch (error) {
    console.error('Content access check error:', error);
    res.status(500).json({ error: 'Failed to check content access' });
  }
});

router.get('/content/premium', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    const premiumContent = await ContentAccessService.getPremiumContent(
      type as ContentType | undefined
    );
    
    res.json({ premiumContent });
  } catch (error) {
    console.error('Premium content listing error:', error);
    res.status(500).json({ error: 'Failed to list premium content' });
  }
});

router.post('/content/access/bulk', requireAuth, requireContentAdmin, async (req: Request, res: Response) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required' });
    }

    const result = await ContentAccessService.bulkUpdateContentAccess(updates);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Bulk content access update error:', error);
    res.status(500).json({ error: 'Failed to bulk update content access' });
  }
});

router.get('/content/stats', requireAuth, requireContentAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await ContentAccessService.getContentAccessStats();
    res.json(stats);
  } catch (error) {
    console.error('Content access stats error:', error);
    res.status(500).json({ error: 'Failed to get content access stats' });
  }
});

export { router as MonetizationRouter };
