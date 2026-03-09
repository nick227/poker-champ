
import { describe, expect, it, beforeEach } from "vitest";
import { getPrisma } from "../../db/prisma.js";
import { CashierService } from "../../engine/economy/CashierService.js";
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
      tableMeta: { name: "Table A" },
    });

    const promiseB = CashierService.processCashGameBuyIn({
      userId,
      tableId: tableB,
      amountCents: amount,
      externalRef: `buyin_${tableB}_${userId}`,
      tableMeta: { name: "Table B" },
    });

    const results = await Promise.allSettled([promiseA, promiseB]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    const succeeded = fulfilled.filter((r) => r.value?.success === true);
    const nonSucceeded = results.length - succeeded.length;

    // Accept both reject-style or success:false-style conflict responses,
    // but exactly one true buy-in should win the race.
    expect(succeeded.length).toBe(1);
    expect(nonSucceeded).toBe(1);

    // Verify bankroll is exactly 0
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.bankrollCents).toBe(0);
  });
});
