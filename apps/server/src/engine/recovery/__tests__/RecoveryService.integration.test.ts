import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import { RecoveryService } from "../RecoveryService.js";
import { CashierService } from "../../economy/CashierService.js";

vi.mock("@colyseus/core", async () => {
  const actual = await vi.importActual<typeof import("@colyseus/core")>("@colyseus/core");
  return {
    ...actual,
    matchMaker: {
      // No live rooms in these tests: every candidate PlayerBalance should be
      // treated as belonging to an abandoned (not-currently-live) table.
      query: vi.fn().mockResolvedValue([]),
    },
  };
});

const runId = nanoid(6);
const testUsers = {
  a: `recovery_a_${runId}`,
  b: `recovery_b_${runId}`,
  c: `recovery_c_${runId}`,
};
const testTables = {
  a: `recovery_table_a_${runId}`,
  b: `recovery_table_b_${runId}`,
  c: `recovery_table_c_${runId}`,
};

async function makeUser(id: string, bankrollCents: number) {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id,
      email: `${id}@recovery.test`,
      passwordHash: "hash",
      displayName: id,
      bankrollCents,
    },
  });
}

async function makeStaleBalance(params: {
  tableId: string;
  userId: string;
  balanceCents: number;
  updatedAt: Date;
}) {
  const prisma = getPrisma();
  await prisma.pokerTable.upsert({
    where: { id: params.tableId },
    create: { id: params.tableId, name: `Table ${params.tableId}` },
    update: {},
  });
  await prisma.playerBalance.create({
    data: {
      id: nanoid(),
      tableId: params.tableId,
      userId: params.userId,
      balanceCents: params.balanceCents,
      status: "ACTIVE",
      updatedAt: params.updatedAt,
    },
  });
}

describe("RecoveryService.reconcileAbandonedBalances", () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    const tableIds = Object.values(testTables);
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.pokerTable.deleteMany({ where: { id: { in: tableIds } } });
    vi.mocked(matchMaker.query).mockResolvedValue([]);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const userIds = Object.values(testUsers);
    const tableIds = Object.values(testTables);
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.pokerTable.deleteMany({ where: { id: { in: tableIds } } });
  });

  it("credits the user's bankroll and marks the balance ABANDONED for a genuinely stale ACTIVE row", async () => {
    const prisma = getPrisma();
    await makeUser(testUsers.a, 0);
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await makeStaleBalance({ tableId: testTables.a, userId: testUsers.a, balanceCents: 5_000, updatedAt: staleAt });

    const result = await RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000);
    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.a } });
    expect(user.bankrollCents).toBe(5_000);

    const pb = await prisma.playerBalance.findUniqueOrThrow({
      where: { tableId_userId: { tableId: testTables.a, userId: testUsers.a } },
    });
    expect(pb.status).toBe("ABANDONED");
    expect(pb.balanceCents).toBe(0);

    const cashoutTxs = await prisma.balanceTransaction.findMany({
      where: { userId: testUsers.a, tableId: testTables.a, type: "CASHOUT" },
    });
    expect(cashoutTxs).toHaveLength(1);
    expect(cashoutTxs[0]!.amountCents).toBe(5_000);
  });

  it("does not touch balances belonging to a table with a live room", async () => {
    const prisma = getPrisma();
    await makeUser(testUsers.a, 0);
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await makeStaleBalance({ tableId: testTables.a, userId: testUsers.a, balanceCents: 5_000, updatedAt: staleAt });

    vi.mocked(matchMaker.query).mockResolvedValue([{ metadata: { tableId: testTables.a } }] as any);

    const result = await RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000);
    expect(result.counts).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.a } });
    expect(user.bankrollCents).toBe(0);

    const pb = await prisma.playerBalance.findUniqueOrThrow({
      where: { tableId_userId: { tableId: testTables.a, userId: testUsers.a } },
    });
    expect(pb.status).toBe("ACTIVE");
  });

  it("is idempotent under two overlapping sweeps of the same stale balance (no double credit)", async () => {
    // Regression test for the bug where the recovery externalRef was seeded
    // with Date.now(), so two concurrent sweep runs (e.g. overlapping cron
    // ticks) would mint two DIFFERENT externalRefs for the same stale row and
    // both would successfully credit the bankroll -> double payout. The fix
    // derives the externalRef deterministically from the PlayerBalance row's
    // updatedAt snapshot, so concurrent runs collide on the same ref and only
    // one can win.
    const prisma = getPrisma();
    await makeUser(testUsers.a, 0);
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await makeStaleBalance({ tableId: testTables.a, userId: testUsers.a, balanceCents: 7_500, updatedAt: staleAt });

    const [first, second] = await Promise.all([
      RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000),
      RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000),
    ]);

    // Exactly one of the two overlapping sweeps should have successfully
    // recovered this row; the other should see nothing to do or fail its
    // attempt on the same row (no double credit either way).
    const totalSuccess = (first.successCount ?? 0) + (second.successCount ?? 0);
    expect(totalSuccess).toBeGreaterThanOrEqual(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.a } });
    expect(user.bankrollCents).toBe(7_500);

    const cashoutTxs = await prisma.balanceTransaction.findMany({
      where: { userId: testUsers.a, tableId: testTables.a, type: "CASHOUT" },
    });
    expect(cashoutTxs).toHaveLength(1);
  });

  it("recovers funds even when the linked PokerTable row is gone (falls back to a synthetic name instead of stranding the balance)", async () => {
    const prisma = getPrisma();
    await makeUser(testUsers.b, 0);
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await makeStaleBalance({ tableId: testTables.b, userId: testUsers.b, balanceCents: 2_500, updatedAt: staleAt });

    // Genuinely orphan the PlayerBalance row by deleting its PokerTable
    // parent with FK checks momentarily suspended (the schema normally
    // cascades this delete, so we can't reach this state through the app's
    // own code paths — this simulates e.g. a stale/deleted table record
    // surviving independently of its balances). No mocking involved: the
    // subsequent prisma.pokerTable.findUnique lookup genuinely returns null.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      await tx.pokerTable.deleteMany({ where: { id: testTables.b } });
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
    });

    const missingTable = await prisma.pokerTable.findUnique({ where: { id: testTables.b } });
    expect(missingTable).toBeNull();

    const result = await RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000);
    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.b } });
    expect(user.bankrollCents).toBe(2_500);
    const pb = await prisma.playerBalance.findUniqueOrThrow({
      where: { tableId_userId: { tableId: testTables.b, userId: testUsers.b } },
    });
    expect(pb.status).toBe("ABANDONED");
  });

  it("isolates a per-row failure: one bad candidate does not block or corrupt recovery of the others", async () => {
    const prisma = getPrisma();
    await makeUser(testUsers.a, 0);
    await makeUser(testUsers.c, 0);
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await makeStaleBalance({ tableId: testTables.a, userId: testUsers.a, balanceCents: 1_000, updatedAt: staleAt });
    await makeStaleBalance({ tableId: testTables.c, userId: testUsers.c, balanceCents: 4_000, updatedAt: staleAt });

    const originalCashOut = CashierService.processCashGameCashOut.bind(CashierService);
    const spy = vi
      .spyOn(CashierService, "processCashGameCashOut")
      .mockImplementation(async (params) => {
        if (params.userId === testUsers.a) {
          throw new Error("SIMULATED_ORPHANED_USER_FAILURE");
        }
        return originalCashOut(params);
      });

    try {
      const result = await RecoveryService.reconcileAbandonedBalances(2 * 60 * 60 * 1000);
      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(1);
    } finally {
      spy.mockRestore();
    }

    // The failing row: no partial credit, still ACTIVE (eligible for retry on
    // the next sweep instead of being silently dropped).
    const userA = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.a } });
    expect(userA.bankrollCents).toBe(0);
    const pbA = await prisma.playerBalance.findUniqueOrThrow({
      where: { tableId_userId: { tableId: testTables.a, userId: testUsers.a } },
    });
    expect(pbA.status).toBe("ACTIVE");

    // The healthy row: recovered normally despite the other row's failure.
    const userC = await prisma.user.findUniqueOrThrow({ where: { id: testUsers.c } });
    expect(userC.bankrollCents).toBe(4_000);
  });
});
