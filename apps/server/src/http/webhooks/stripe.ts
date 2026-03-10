import { Request, Response } from 'express';
import { createRequire } from 'node:module';
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

const MAX_PROCESSED_EVENT_IDS = 10_000;
const processedEventIds = new Set<string>();

function hasProcessedEvent(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

function markEventProcessed(eventId: string): void {
  if (processedEventIds.size >= MAX_PROCESSED_EVENT_IDS) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  processedEventIds.add(eventId);
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

  if (hasProcessedEvent(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  logWebhookEvent(event);
  console.log(`Processing webhook event: ${event.type}`);

  try {
    const result = await MembershipService.handleWebhookEvent(event);
    if (result.success) {
      markEventProcessed(event.id);
      res.json({ received: true, ...result });
    } else {
      console.error('Webhook processing failed:', result.error);
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
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
