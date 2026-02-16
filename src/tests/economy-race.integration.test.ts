
import { describe, expect, it, beforeEach } from "vitest";
import { getPrisma } from "../db/prisma.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { nanoid } from "nanoid";

describe("Cashier Race Conditions", () => {
  const userId = "test_user_race";
  const tableA = "table_a";
  const tableB = "table_b";

  beforeEach(async () => {
    const prisma = getPrisma();
    // Clean up
    await prisma.balanceTransaction.deleteMany({ where: { userId } });
    await prisma.playerBalance.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.pokerTable.deleteMany({ where: { id: { in: [tableA, tableB] } } });

    // Setup tables
    await prisma.pokerTable.create({ data: { id: tableA, name: "Table A" } });
    await prisma.pokerTable.create({ data: { id: tableB, name: "Table B" } });

    // Setup initial bankroll
    await prisma.user.create({
      data: {
        id: userId,
        email: `race_${nanoid(4)}@test.com`,
        passwordHash: "hash",
        displayName: "RaceTester",
        bankrollCents: 10000, // $100
      },
    });
  });

  it("prevents overspending bankroll during concurrent buy-ins", async () => {
    // Attempt to buy in $100 to two tables simultaneously
    // Total $200, but only $100 available.
    const amount = 10000;

    const promiseA = CashierService.processCashGameBuyIn({
      userId,
      tableId: tableA,
      amountCents: amount,
      externalRef: `buyin_${tableA}_${userId}`,
    });

    const promiseB = CashierService.processCashGameBuyIn({
      userId,
      tableId: tableB,
      amountCents: amount,
      externalRef: `buyin_${tableB}_${userId}`,
    });

    const results = await Promise.allSettled([promiseA, promiseB]);

    const successes = results.filter(r => r.status === "fulfilled");
    const failures = results.filter(r => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    
    const failReason = (failures[0] as PromiseRejectedResult).reason.message;
    console.log("RACE_FAILURE_REASON:", failReason);
    // ...

    // Verify bankroll is exactly 0
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.bankrollCents).toBe(0);
  });
});
