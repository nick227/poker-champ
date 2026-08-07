import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";

const { matchMakerMock } = vi.hoisted(() => ({
  matchMakerMock: { query: vi.fn(), remoteRoomCall: vi.fn() },
}));

vi.mock("@colyseus/core", () => ({
  matchMaker: matchMakerMock,
}));

const TEST_USER_ID = "test_user_cashout_idem";

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID };
    next();
  },
}));

import { economyRouter } from "../../http/EconomyRouter.js";

/**
 * Real-DB regression coverage for the cash-out idempotency-key bug: when the
 * client omits `externalRef`, the server used to fall back to the constant
 * string `cashout_${tableId}_${userId}` on every call. Since
 * BalanceTransaction.externalRef is the idempotency key, a second genuine
 * cash-out for the same user/table would collide with the first one's key and
 * be silently treated as "already applied" — stranding the player's funds.
 *
 * These tests exercise the real HTTP route with the real CashierService and a
 * real database (no mocking of the economy layer), so they prove actual money
 * movement rather than just call arguments.
 */
describe("Economy cash-out idempotency (real DB)", () => {
  const tableId = "table_cashout_idem";
  let server: http.Server;
  let baseUrl: string;

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  async function seed(initialBalanceCents: number) {
    const prisma = getPrisma();
    await prisma.balanceTransaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.playerBalance.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });

    await prisma.pokerTable.create({ data: { id: tableId, name: "Cashout Idem Table" } });
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: `cashout_idem_${nanoid(6)}@test.com`,
        passwordHash: "hash",
        displayName: "CashoutIdemTester",
        bankrollCents: 0,
      },
    });
    await prisma.playerBalance.create({
      data: {
        id: nanoid(),
        tableId,
        userId: TEST_USER_ID,
        balanceCents: initialBalanceCents,
        status: "ACTIVE",
      },
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
    matchMakerMock.query.mockResolvedValue([]); // no live room; router falls back to PokerTable row
  });

  it("applies two genuinely distinct cash-outs (no client externalRef) as two separate debits", async () => {
    await seed(20_000);

    const first = await post("/api/economy/cash-out", { tableId, amountCents: 5_000 });
    const second = await post("/api/economy/cash-out", { tableId, amountCents: 5_000 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.success).toBe(true);
    expect(secondBody.success).toBe(true);

    const prisma = getPrisma();
    const [balance, user, txs] = await Promise.all([
      prisma.playerBalance.findUnique({ where: { tableId_userId: { tableId, userId: TEST_USER_ID } } }),
      prisma.user.findUnique({ where: { id: TEST_USER_ID } }),
      prisma.balanceTransaction.findMany({ where: { userId: TEST_USER_ID, type: "CASHOUT" } }),
    ]);

    // Both cash-outs must have actually applied: table balance down by 10,000
    // total and bankroll up by 10,000 total — NOT stranded by a colliding
    // fallback idempotency key.
    expect(balance?.balanceCents).toBe(10_000);
    expect(user?.bankrollCents).toBe(10_000);
    expect(txs).toHaveLength(2);
    const refs = txs.map((t) => t.externalRef);
    expect(new Set(refs).size).toBe(2);
  });

  it("keeps a cash-out retried with the SAME client externalRef idempotent (applies once)", async () => {
    await seed(20_000);
    const externalRef = "client-cashout-retry-ref";

    const first = await post("/api/economy/cash-out", { tableId, amountCents: 5_000, externalRef });
    const second = await post("/api/economy/cash-out", { tableId, amountCents: 5_000, externalRef });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const prisma = getPrisma();
    const [balance, user, txs] = await Promise.all([
      prisma.playerBalance.findUnique({ where: { tableId_userId: { tableId, userId: TEST_USER_ID } } }),
      prisma.user.findUnique({ where: { id: TEST_USER_ID } }),
      prisma.balanceTransaction.findMany({ where: { userId: TEST_USER_ID, type: "CASHOUT" } }),
    ]);

    // Only ONE debit should have applied — the retry with the same client ref
    // must be a no-op, not a second cash-out.
    expect(balance?.balanceCents).toBe(15_000);
    expect(user?.bankrollCents).toBe(5_000);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.externalRef).toBe(externalRef);
  });
});
