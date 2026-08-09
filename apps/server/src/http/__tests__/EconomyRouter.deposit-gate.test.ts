import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    balanceTransaction: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  };
  return { prismaMock };
});

vi.mock("@colyseus/core", () => ({
  matchMaker: { query: vi.fn(), remoteRoomCall: vi.fn() },
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user_test_deposit" };
    next();
  },
}));

import { economyRouter } from "../EconomyRouter.js";

/**
 * /deposit unconditionally credits a fixed fake amount with no real payment
 * provider involved — fine for dev/demo, but must not be reachable in a
 * real-money production deployment. It's now gated behind an explicit opt-in
 * (ALLOW_FAKE_DEPOSITS=true, and never in NODE_ENV=production).
 *
 * isFakeDepositsEnabled() (apps/server/src/config/features.ts) reads
 * process.env live on every call, so toggling env vars per-test against the
 * same running router instance is enough — no module re-import needed.
 */
describe("EconomyRouter /deposit gating", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowFakeDeposits = process.env.ALLOW_FAKE_DEPOSITS;

  let server: http.Server;
  let baseUrl: string;

  async function post(path: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: "Bearer test" },
    });
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/economy", economyRouter);
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

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ bankrollCents: 0 });
    prismaMock.user.update.mockResolvedValue({ bankrollCents: 100_000 });
    prismaMock.balanceTransaction.create.mockResolvedValue({});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowFakeDeposits === undefined) delete process.env.ALLOW_FAKE_DEPOSITS;
    else process.env.ALLOW_FAKE_DEPOSITS = originalAllowFakeDeposits;
  });

  it("is disabled by default (no ALLOW_FAKE_DEPOSITS set)", async () => {
    delete process.env.ALLOW_FAKE_DEPOSITS;
    process.env.NODE_ENV = "development";

    const res = await post("/api/economy/deposit");
    expect([403, 404]).toContain(res.status);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("is disabled in production even if ALLOW_FAKE_DEPOSITS=true", async () => {
    process.env.ALLOW_FAKE_DEPOSITS = "true";
    process.env.NODE_ENV = "production";

    const res = await post("/api/economy/deposit");
    expect([403, 404]).toContain(res.status);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("works when explicitly enabled outside production", async () => {
    process.env.ALLOW_FAKE_DEPOSITS = "true";
    process.env.NODE_ENV = "development";

    const res = await post("/api/economy/deposit");
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
