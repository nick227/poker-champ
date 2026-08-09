import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../../engine/economy/CashierService.js";
import { LedgerService } from "../../engine/persistence/LedgerService.js";

const runId = nanoid(6);
const userA = `edge_user_a_${runId}`;
const userB = `edge_user_b_${runId}`;
const tableId = `edge_table_${runId}`;

async function makeUser(id: string, bankrollCents: number) {
  const prisma = getPrisma();
  await prisma.user.create({
    data: {
      id,
      email: `${id}@edge.test`,
      passwordHash: "hash",
      displayName: id,
      bankrollCents,
    },
  });
}

describe("Economy edge cases (real-money hardening)", () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
    await prisma.pokerTable.create({ data: { id: tableId, name: "Edge Case Table" } });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.playerBalance.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.pokerTable.deleteMany({ where: { id: tableId } });
  });

  it("REQUIRED-1: concurrent cash-out requests from two sessions do not double-pay or corrupt the balance", async () => {
    const prisma = getPrisma();
    await makeUser(userA, 100_000);
    await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 5_000,
      externalRef: `buyin_${tableId}_${userA}`,
      tableMeta: { name: "Edge Case Table" },
    });

    // Two independent "sessions" (e.g. two browser tabs) both attempt to
    // cash out the *entire* stack at ~the same time with distinct
    // externalRefs (unlike a client retry with the same ref, these are two
    // genuinely separate cash-out intents racing on the same underlying
    // PlayerBalance row).
    const [r1, r2] = await Promise.allSettled([
      CashierService.processCashGameCashOut({
        userId: userA,
        tableId,
        amountCents: 5_000,
        externalRef: `cashout_session_1_${userA}`,
        tableMeta: { name: "Edge Case Table" },
      }),
      CashierService.processCashGameCashOut({
        userId: userA,
        tableId,
        amountCents: 5_000,
        externalRef: `cashout_session_2_${userA}`,
        tableMeta: { name: "Edge Case Table" },
      }),
    ]);

    const succeeded = [r1, r2].filter(
      (r): r is PromiseFulfilledResult<{ success: boolean }> => r.status === "fulfilled" && r.value.success,
    );
    // Exactly one of the two racing cash-outs may actually pay out; the
    // other must be rejected (insufficient table balance) rather than also
    // paying out and corrupting the balance.
    expect(succeeded.length).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    expect(user.bankrollCents).toBe(100_000);

    const pb = await prisma.playerBalance.findUniqueOrThrow({
      where: { tableId_userId: { tableId, userId: userA } },
    });
    // Never allow the table balance to go negative or otherwise inconsistent.
    expect(pb.balanceCents).toBeGreaterThanOrEqual(0);
    expect(pb.balanceCents).toBe(0);
  });

  it("REQUIRED-1b: a retried cash-out with the SAME externalRef is idempotent (client double-submit)", async () => {
    const prisma = getPrisma();
    await makeUser(userA, 100_000);
    await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 3_000,
      externalRef: `buyin_${tableId}_${userA}`,
      tableMeta: { name: "Edge Case Table" },
    });

    const externalRef = `cashout_retry_${userA}`;
    const [r1, r2] = await Promise.all([
      CashierService.processCashGameCashOut({
        userId: userA,
        tableId,
        amountCents: 3_000,
        externalRef,
        tableMeta: { name: "Edge Case Table" },
      }),
      CashierService.processCashGameCashOut({
        userId: userA,
        tableId,
        amountCents: 3_000,
        externalRef,
        tableMeta: { name: "Edge Case Table" },
      }),
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    expect(user.bankrollCents).toBe(100_000);
  });

  it("REQUIRED-2: mid-hand disconnect payout correctness — ledger reconciles after a forced auto-fold", async () => {
    const prisma = getPrisma();
    await makeUser(userA, 100_000);
    await makeUser(userB, 100_000);
    await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 5_000,
      externalRef: `buyin_${tableId}_${userA}`,
      tableMeta: { name: "Edge Case Table" },
    });
    await CashierService.processCashGameBuyIn({
      userId: userB,
      tableId,
      amountCents: 5_000,
      externalRef: `buyin_${tableId}_${userB}`,
      tableMeta: { name: "Edge Case Table" },
    });

    const ledger = new LedgerService(prisma as any, tableId);
    const handId = `hand_${nanoid(8)}`;
    await prisma.hand.create({
      data: { id: handId, tableId, dealerSeat: 0, smallBlindCents: 50, bigBlindCents: 100 },
    });

    // A and B post blinds; A then goes disconnected mid-hand and is
    // auto-folded by the dealer's disconnect-handling (represented here as
    // a BLIND-only cost with no further debit), B takes the pot uncontested.
    const balanceAAfterBlind = await ledger.postBlind({ userId: userA, handId, blindType: "SB", amountCents: 50 });
    const balanceBAfterBlind = await ledger.postBlind({ userId: userB, handId, blindType: "BB", amountCents: 100 });
    expect(balanceAAfterBlind).toBe(5_000 - 50);
    expect(balanceBAfterBlind).toBe(5_000 - 100);

    // A disconnects mid-hand (no further ledger action for A: they're
    // auto-folded, forfeiting only what they've already put in).
    // B wins the uncontested pot (blinds only, 150 total).
    const balanceBAfterPayout = await ledger.creditPayout({ userId: userB, handId, amountCents: 150 });
    expect(balanceBAfterPayout).toBe(5_000 - 100 + 150);

    // The hand's ledger must balance: total debits + credits across
    // BLIND/PAYOUT rows for this hand sum to exactly zero.
    await expect(ledger.assertHandBalanced(handId)).resolves.not.toThrow();

    const finalA = await ledger.getBalance(userA);
    const finalB = await ledger.getBalance(userB);
    expect(finalA).toBe(4_950); // lost only the SB they posted before disconnecting
    expect(finalB).toBe(5_050); // won the pot net of their own BB contribution

    // Re-running the disconnected player's payout/credit path a second time
    // (e.g. a retried settlement after a reconnect race) must not pay B
    // twice, thanks to the deterministic per-hand externalRef.
    const balanceBAgain = await ledger.creditPayout({ userId: userB, handId, amountCents: 150 });
    expect(balanceBAgain).toBe(5_050);

    const handTxs = await prisma.balanceTransaction.findMany({ where: { tableId, handId } });
    const payoutTxs = handTxs.filter((t) => t.type === "PAYOUT");
    expect(payoutTxs).toHaveLength(1);
  });

  it("REQUIRED-3: partial rebuy (less than a full buy-in) applies correctly and is idempotent", async () => {
    const prisma = getPrisma();
    await makeUser(userA, 100_000);
    await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 5_000,
      externalRef: `buyin_initial_${userA}`,
      tableMeta: { name: "Edge Case Table" },
    });

    // Simulate the player losing most of their stack in play.
    const ledger = new LedgerService(prisma as any, tableId);
    const handId = `hand_${nanoid(8)}`;
    await prisma.hand.create({
      data: { id: handId, tableId, dealerSeat: 0, smallBlindCents: 50, bigBlindCents: 100 },
    });
    await ledger.debitBet({ userId: userA, handId, street: "PREFLOP", action: "ALL_IN", amountCents: 4_800, sequenceNum: 1 });

    const beforeRebuy = await ledger.getBalance(userA);
    expect(beforeRebuy).toBe(200);

    // Player tops up with a partial rebuy — less than a full buy-in.
    const partialRebuyRef = `partial_rebuy_${userA}_1`;
    const result = await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 1_500,
      externalRef: partialRebuyRef,
      tableMeta: { name: "Edge Case Table" },
    });
    expect(result.success).toBe(true);
    expect(result.newTableBalance).toBe(200 + 1_500);

    const afterRebuy = await ledger.getBalance(userA);
    expect(afterRebuy).toBe(1_700);

    const userAfterRebuy = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    expect(userAfterRebuy.bankrollCents).toBe(100_000 - 5_000 - 1_500);

    // Idempotency: retrying the exact same partial-rebuy request (same
    // externalRef, e.g. a client retry after a dropped response) must not
    // apply the top-up twice.
    const retry = await CashierService.processCashGameBuyIn({
      userId: userA,
      tableId,
      amountCents: 1_500,
      externalRef: partialRebuyRef,
      tableMeta: { name: "Edge Case Table" },
    });
    expect(retry.success).toBe(true);
    expect(retry.newTableBalance).toBe(1_700);

    const finalBalance = await ledger.getBalance(userA);
    expect(finalBalance).toBe(1_700);
    const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    expect(finalUser.bankrollCents).toBe(100_000 - 5_000 - 1_500);

    const buyinTxCount = await prisma.balanceTransaction.count({
      where: { userId: userA, tableId, type: "BUYIN", externalRef: partialRebuyRef },
    });
    expect(buyinTxCount).toBe(1);
  });
});
