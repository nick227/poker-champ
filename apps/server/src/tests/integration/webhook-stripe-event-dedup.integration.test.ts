import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { createRequire } from "node:module";
import { getPrisma, disconnectPrisma } from "@poker-champ/db";

// STRIPE_CONFIG.WEBHOOK_SECRET (apps/server/src/config/features.ts) is a
// module-level const computed from process.env at import time. Set it via
// vi.hoisted() so this runs before the static imports below (and before the
// dependency graph they pull in) evaluate that module — a plain top-level
// assignment here would run too late to affect the already-imported const.
const TEST_WEBHOOK_SECRET = "whsec_test_dedup_secret";
vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dedup_secret";
  // getStripeClient() (apps/server/src/http/webhooks/stripe.ts) reads this at
  // call-time, but the Stripe SDK requires a non-empty apiKey string to
  // construct a client at all (even for local, offline signature
  // verification), so it still needs to be set for the handler to work here.
  if (!process.env.STRIPE_SECRET_KEY) {
    process.env.STRIPE_SECRET_KEY = "sk_test_dedup_placeholder";
  }
});

import { handleStripeWebhook } from "../../http/webhooks/stripe.js";
import { MembershipService } from "../../api/memberships.js";

const require = createRequire(import.meta.url);
type StripeSdk = new (
  apiKey: string,
  options: { apiVersion: string },
) => {
  webhooks: {
    generateTestHeaderString: (args: { payload: string; secret: string }) => string;
  };
};

/**
 * Regression coverage for the Stripe webhook dedup durability bug: the handler
 * used to dedup processed event ids with an in-memory Set<string>, which was
 * wiped on every process restart. That meant every previously-seen event would
 * be silently re-processed (and any side effects re-applied) after a redeploy.
 *
 * The fix replaces the Set with the StripeEvent table (DB is the source of
 * truth), using an idempotent-insert pattern (attempt insert, treat a unique
 * constraint violation on `eventId` as "already processed").
 *
 * These tests exercise the real handler end-to-end (real signature
 * verification via Stripe's own `generateTestHeaderString` helper, real DB
 * dedup) rather than mocking internals, so they actually prove durability
 * rather than just exercising a helper function in isolation.
 */
describe("Stripe webhook event dedup (durable, DB-backed)", () => {
  const webhookSecret = TEST_WEBHOOK_SECRET;

  let server: http.Server;
  let baseUrl: string;

  function makeEvent(id: string, type = "payment_intent.succeeded") {
    return {
      id,
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "pi_test", object: "payment_intent" } },
    };
  }

  function signedRequest(event: unknown) {
    const StripeCtor = require("stripe") as StripeSdk;
    const stripe = new StripeCtor("sk_test_placeholder", { apiVersion: "2024-11-20.acacia" });
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    return { payload, header };
  }

  async function postWebhook(event: unknown) {
    const { payload, header } = signedRequest(event);
    return fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": header },
      body: payload,
    });
  }

  beforeAll(async () => {
    const app = express();
    app.post("/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.stripeEvent.deleteMany({ where: { eventId: { startsWith: "evt_test_dedup_" } } });
    vi.restoreAllMocks();
  });

  it("only invokes the business-logic handler once for the same event id replayed twice", async () => {
    const spy = vi.spyOn(MembershipService, "handleWebhookEvent");
    const eventId = `evt_test_dedup_${Date.now()}_1`;
    const event = makeEvent(eventId);

    const first = await postWebhook(event);
    const second = await postWebhook(event);

    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.duplicate).not.toBe(true);

    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.duplicate).toBe(true);

    // The actual side-effect-bearing handler must have run exactly once, even
    // though the HTTP endpoint was called twice with the same event id.
    expect(spy).toHaveBeenCalledTimes(1);

    const prisma = getPrisma();
    const rows = await prisma.stripeEvent.findMany({ where: { eventId } });
    expect(rows).toHaveLength(1);
  });

  it("stays deduped across a simulated process restart (fresh DB connection, no in-process memory)", async () => {
    const eventId = `evt_test_dedup_${Date.now()}_2`;
    const event = makeEvent(eventId);

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.duplicate).not.toBe(true);

    // Simulate a process restart: tear down and re-establish the Prisma
    // connection. There is no in-memory Set left to survive or be lost here —
    // dedup must come from a fresh query against the StripeEvent table.
    await disconnectPrisma();
    getPrisma();

    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.duplicate).toBe(true);

    const prisma = getPrisma();
    const rows = await prisma.stripeEvent.findMany({ where: { eventId } });
    expect(rows).toHaveLength(1);
  });

  it("processes two distinct event ids independently", async () => {
    const spy = vi.spyOn(MembershipService, "handleWebhookEvent");
    const eventIdA = `evt_test_dedup_${Date.now()}_a`;
    const eventIdB = `evt_test_dedup_${Date.now()}_b`;

    const resA = await postWebhook(makeEvent(eventIdA));
    const resB = await postWebhook(makeEvent(eventIdB));

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    expect(bodyA.duplicate).not.toBe(true);
    expect(bodyB.duplicate).not.toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
