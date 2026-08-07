import { Request, Response } from 'express';
import { createRequire } from 'node:module';
import { Prisma } from '@prisma/client';
import { getPrisma } from '@poker-champ/db';
import { nanoid } from 'nanoid';
import { MembershipService } from '../../api/memberships.js';
import { STRIPE_CONFIG } from '../../config/features.js';

const require = createRequire(import.meta.url);
type StripeEvent = {
  type: string;
  id: string;
  created: number;
  data: { object: Record<string, unknown> };
};
type StripeClient = {
  webhooks: {
    constructEvent: (body: unknown, signature: string, secret: string) => StripeEvent;
  };
};

let stripeClient: StripeClient | null = null;
function getStripeClient() {
  if (stripeClient) return stripeClient;
  const StripeCtor = require('stripe') as new (
    apiKey: string,
    options: { apiVersion: string },
  ) => StripeClient;
  stripeClient = new StripeCtor(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2024-11-20.acacia',
  });
  return stripeClient;
}

/**
 * Durable webhook dedup, backed by the StripeEvent table (source of truth).
 * Replaces the old in-memory Set<string>, which was wiped on every process
 * restart/redeploy and would silently re-process (and potentially double-credit)
 * every previously-seen Stripe event.
 *
 * Uses an idempotent-insert pattern — attempt the insert and treat a unique-
 * constraint violation on `eventId` as "already processed" — rather than a
 * check-then-insert race. Same house style as LedgerService.applyTransaction's
 * externalRef idempotency (apps/server/src/engine/persistence/LedgerService.ts).
 *
 * The claim is taken before processing (closing the race for near-simultaneous
 * duplicate deliveries) and released if processing fails, so a genuine Stripe
 * retry after a transient error isn't swallowed as a "duplicate".
 */
async function claimStripeEvent(eventId: string, type: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.stripeEvent.create({
      data: { id: nanoid(), eventId, type },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}

async function releaseStripeEventClaim(eventId: string): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.stripeEvent.delete({ where: { eventId } });
  } catch (err) {
    // Best-effort: if the row is already gone (e.g. raced with another release)
    // there's nothing to clean up. Any other error is logged but must not mask
    // the original processing failure being reported to the caller.
    console.error(`Failed to release StripeEvent claim for ${eventId}:`, err);
  }
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    return res.status(400).json({ error: 'Missing Stripe signature' });
  }

  if (!STRIPE_CONFIG.WEBHOOK_SECRET) {
    console.error('Stripe webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: StripeEvent;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_CONFIG.WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${message}` });
  }

  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) {
    return res.json({ received: true, duplicate: true });
  }

  logWebhookEvent(event);
  console.log(`Processing webhook event: ${event.type}`);

  try {
    const result = await MembershipService.handleWebhookEvent(event);
    if (result.success) {
      res.json({ received: true, ...result });
    } else {
      console.error('Webhook processing failed:', result.error);
      await releaseStripeEventClaim(event.id);
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
    await releaseStripeEventClaim(event.id);
    res.status(500).json({ error: 'Internal webhook processing error' });
  }
}

// Webhook event logging for debugging
export function logWebhookEvent(event: StripeEvent) {
  const objectId = typeof event.data.object.id === 'string' ? event.data.object.id : null;
  const objectType = typeof event.data.object.object === 'string' ? event.data.object.object : null;
  const logData = {
    type: event.type,
    id: event.id,
    created: new Date(event.created * 1000).toISOString(),
    data: {
      object: objectId,
      type: objectType,
    },
  };

  console.log('Stripe Webhook Event:', JSON.stringify(logData, null, 2));
}
