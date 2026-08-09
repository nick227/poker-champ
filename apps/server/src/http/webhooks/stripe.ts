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
 * A claim row is stale (abandoned mid-flight, e.g. by a process crash or hard
 * restart between the claim insert and completion) once it's been sitting in
 * "claimed" longer than any legitimate webhook handler run should ever take.
 * Comfortably above worst-case processing time so a merely-slow request is
 * never mistaken for a dead one.
 */
const STALE_CLAIM_THRESHOLD_MS = 2 * 60 * 1000;

type ClaimResult = { claimed: true } | { claimed: false; reason: 'duplicate' | 'in_flight' };

/**
 * Durable webhook dedup, backed by the StripeEvent table (source of truth).
 * Replaces the old in-memory Set<string>, which was wiped on every process
 * restart/redeploy and would silently re-process (and potentially double-credit)
 * every previously-seen Stripe event.
 *
 * A claim row tracks *state* ("claimed" | "completed" | "failed"), not just
 * existence — existence alone can't distinguish "actively being processed"
 * from "abandoned mid-flight by a crash", which is exactly the gap that let a
 * post-crash Stripe retry get silently swallowed as a duplicate with no
 * membership ever granted.
 *
 * Uses an idempotent-insert pattern — attempt the insert and treat a unique-
 * constraint violation on `eventId` as "already claimed" — rather than a
 * check-then-insert race. Same house style as LedgerService.applyTransaction's
 * externalRef idempotency (apps/server/src/engine/persistence/LedgerService.ts).
 * On a unique-constraint hit, the existing row's status decides what happens:
 *  - "completed" -> genuine duplicate, reject.
 *  - "claimed" and still within STALE_CLAIM_THRESHOLD_MS -> a concurrent
 *    delivery is in flight right now, reject.
 *  - "claimed" and older than the threshold -> orphaned by a crash; atomically
 *    reclaim it (guarded by a WHERE on the old processingStartedAt, so two
 *    concurrent retries can't both win) and process it for real. Stripe's own
 *    retry becomes the recovery mechanism — no separate repair job needed.
 *  - "failed" -> the previous attempt threw and was marked failed already;
 *    always safe to reclaim immediately.
 */
async function claimStripeEvent(eventId: string, type: string): Promise<ClaimResult> {
  const prisma = getPrisma();
  try {
    await prisma.stripeEvent.create({
      data: { id: nanoid(), eventId, type, status: 'claimed' },
    });
    return { claimed: true };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err;
    }
  }

  const existing = await prisma.stripeEvent.findUnique({ where: { eventId } });
  if (!existing) {
    // Raced with a concurrent release/delete between the failed insert and
    // this lookup; treat as in-flight and let the caller's response tell
    // Stripe to retry rather than risk a second concurrent processing pass.
    return { claimed: false, reason: 'in_flight' };
  }

  if (existing.status === 'completed') {
    return { claimed: false, reason: 'duplicate' };
  }

  const isStale =
    existing.status === 'failed' ||
    Date.now() - existing.processingStartedAt.getTime() > STALE_CLAIM_THRESHOLD_MS;
  if (!isStale) {
    return { claimed: false, reason: 'in_flight' };
  }

  const reclaimed = await prisma.stripeEvent.updateMany({
    where: {
      eventId,
      // Re-check the same staleness condition atomically at the DB level so
      // two concurrent retries racing this reclaim can't both succeed.
      OR: [{ status: 'failed' }, { processingStartedAt: { lt: new Date(Date.now() - STALE_CLAIM_THRESHOLD_MS) } }],
    },
    data: { status: 'claimed', processingStartedAt: new Date(), completedAt: null },
  });

  if (reclaimed.count === 0) {
    // Another concurrent retry won the reclaim race first.
    return { claimed: false, reason: 'in_flight' };
  }
  return { claimed: true };
}

async function markStripeEventCompleted(eventId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.stripeEvent.update({
    where: { eventId },
    data: { status: 'completed', completedAt: new Date() },
  });
}

async function markStripeEventFailed(eventId: string): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.stripeEvent.update({
      where: { eventId },
      data: { status: 'failed' },
    });
  } catch (err) {
    // Best-effort: if the row is already gone there's nothing to mark. Any
    // other error is logged but must not mask the original processing
    // failure being reported to the caller — the stale-claim reclaim path
    // above is the backstop if this update itself never runs (e.g. a crash
    // right here), so failing silently is safe.
    console.error(`Failed to mark StripeEvent ${eventId} as failed:`, err);
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

  const claim = await claimStripeEvent(event.id, event.type);
  if (!claim.claimed) {
    return res.json({ received: true, duplicate: true });
  }

  logWebhookEvent(event);
  console.log(`Processing webhook event: ${event.type}`);

  try {
    const result = await MembershipService.handleWebhookEvent(event);
    if (result.success) {
      await markStripeEventCompleted(event.id);
      res.json({ received: true, ...result });
    } else {
      console.error('Webhook processing failed:', result.error);
      await markStripeEventFailed(event.id);
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
    await markStripeEventFailed(event.id);
    res.status(500).json({ error: 'Internal webhook processing error' });
  }
}

/**
 * A claim stuck in "claimed" this long has outlived even the stale-claim
 * reclaim window several times over — either Stripe's retry window (a few
 * days) has been exhausted, or a webhook was somehow never resent. At that
 * point the reclaim-on-retry mechanism above has no more retries left to
 * catch it, so this needs a human to look at it rather than silently sitting
 * there. Log-only: unlike the reclaim path, this never mutates the row, so
 * it can't race with a real retry that's actually in flight.
 */
const STUCK_CLAIM_ALERT_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Periodic visibility check for orphaned StripeEvent claims (see
 * claimStripeEvent's reclaim logic above for the primary recovery path via
 * Stripe's own retries). This is alerting only, not a repair job — mirrors
 * RecoveryService.reconcileAbandonedBalances in spirit but does no writes.
 */
export async function checkForStuckStripeEvents(
  thresholdMs: number = STUCK_CLAIM_ALERT_THRESHOLD_MS
): Promise<{ stuckCount: number }> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - thresholdMs);

  const stuck = await prisma.stripeEvent.findMany({
    where: { status: 'claimed', processingStartedAt: { lt: cutoff } },
    select: { eventId: true, type: true, processingStartedAt: true },
  });

  if (stuck.length > 0) {
    console.error(
      `${stuck.length} StripeEvent claim(s) stuck in "claimed" past ${thresholdMs}ms — possible dropped webhook processing:`,
      stuck
    );
  }

  return { stuckCount: stuck.length };
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
