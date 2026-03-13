import { describe, expect, it } from "vitest";

import { LedgerService } from "./LedgerService.js";

type TxRecord = {
  externalRef: string;
  userId: string;
  handId: string;
  amountCents: number;
  type: string;
};

function createBarrier(target: number) {
  let count = 0;
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    count += 1;
    if (count >= target) {
      release();
    }
    await promise;
  };
}

function makePrismaHarness() {
  const balances = new Map<string, number>();
  const txRecords: TxRecord[] = [];
  const waitForConcurrentCredits = createBarrier(2);

  const keyFor = (tableId: string, userId: string) => `${tableId}:${userId}`;

  const prisma = {
    $transaction: async <T>(fn: (tx: any) => Promise<T>) => {
      const tx = {
        balanceTransaction: {
          findUnique: async ({ where: { externalRef } }: any) =>
            txRecords.find((record) => record.externalRef === externalRef) ?? null,
          create: async ({ data }: any) => {
            txRecords.push({
              externalRef: data.externalRef,
              userId: data.userId,
              handId: data.handId,
              amountCents: data.amountCents,
              type: data.type,
            });
            return data;
          },
        },
        playerBalance: {
          findUnique: async ({ where: { tableId_userId } }: any) => {
            const balance = balances.get(keyFor(tableId_userId.tableId, tableId_userId.userId));
            return balance == null ? null : { balanceCents: balance };
          },
          upsert: async ({ where: { tableId_userId }, create }: any) => {
            const key = keyFor(tableId_userId.tableId, tableId_userId.userId);
            if (!balances.has(key)) {
              balances.set(key, create.balanceCents);
            }
            return { balanceCents: balances.get(key) ?? 0 };
          },
          update: async ({ where: { tableId_userId }, data }: any) => {
            if (typeof data.balanceCents?.increment === "number") {
              await waitForConcurrentCredits();
            }
            const key = keyFor(tableId_userId.tableId, tableId_userId.userId);
            const current = balances.get(key) ?? 0;
            const next = current + (data.balanceCents?.increment ?? 0);
            balances.set(key, next);
            return { balanceCents: next };
          },
          updateMany: async ({ where, data }: any) => {
            const key = keyFor(where.tableId, where.userId);
            const current = balances.get(key) ?? 0;
            const required = Number(where.balanceCents?.gte ?? 0);
            if (current < required) return { count: 0 };
            const decrement = Number(data.balanceCents?.decrement ?? 0);
            balances.set(key, current - decrement);
            return { count: 1 };
          },
        },
      };
      return await fn(tx);
    },
  };

  return { prisma, balances, txRecords, keyFor };
}

describe("LedgerService concurrent credit isolation", () => {
  it("atomically credits concurrent payouts for the same recipient without lost updates", async () => {
    const { prisma, balances, txRecords, keyFor } = makePrismaHarness();
    const ledger = new LedgerService(prisma as any, "table_1");
    balances.set(keyFor("table_1", "user_1"), 1_000);

    const [firstBalance, secondBalance] = await Promise.all([
      ledger.creditPayout({
        userId: "user_1",
        handId: "hand_1",
        amountCents: 300,
        potIndex: 0,
      }),
      ledger.creditPayout({
        userId: "user_1",
        handId: "hand_1",
        amountCents: 200,
        potIndex: 1,
      }),
    ]);

    expect([firstBalance, secondBalance].sort((a, b) => a - b)).toEqual([1300, 1500]);
    expect(balances.get(keyFor("table_1", "user_1"))).toBe(1_500);
    expect(txRecords).toHaveLength(2);
    expect(txRecords.map((record) => record.externalRef).sort()).toEqual([
      "payout_table_1_user_1_hand_1_pot0",
      "payout_table_1_user_1_hand_1_pot1",
    ]);
    const totalCredited = txRecords.reduce((sum, record) => sum + record.amountCents, 0);
    expect(totalCredited).toBe(500);
  });
});
