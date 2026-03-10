
import { getPrisma } from "@poker-champ/db";
import { nanoid } from "nanoid";

export const TABLE_NAME_REQUIRED = "TABLE_NAME_REQUIRED" as const;

export class CashierService {
  private static assertTableMeta(tableMeta: { name: string; creatorId?: string }): void {
    if (!tableMeta.name || tableMeta.name.trim().length === 0) {
      throw new Error(TABLE_NAME_REQUIRED);
    }
  }

  private static async ensureTableExists(
    tx: any,
    tableId: string,
    tableMeta: { name: string; creatorId?: string },
  ) {
    CashierService.assertTableMeta(tableMeta);
    await tx.pokerTable.upsert({
      where: { id: tableId },
      create: {
        id: tableId,
        name: tableMeta.name,
        creatorId: tableMeta.creatorId,
      },
      update: {},
    });
  }

  /**
   * Cash Game Buy-In
   * Atomically debits User.bankrollCents and credits PlayerBalance.
   */
  static async processCashGameBuyIn(params: {
    userId: string;
    tableId: string;
    amountCents: number;
    externalRef: string;
    tableMeta: { name: string; creatorId?: string };
  }): Promise<{ success: boolean; newTableBalance: number }> {
    const prisma = getPrisma();
    const { userId, tableId, amountCents, externalRef, tableMeta } = params;

    return await prisma.$transaction(async (tx: any) => {
      // Ensure FK target exists for PlayerBalance/BalanceTransaction writes.
      await CashierService.ensureTableExists(tx, tableId, tableMeta);

      // 1. Check idempotency
      const existingTx = await tx.balanceTransaction.findUnique({
        where: { externalRef },
      });
      if (existingTx) {
         // Already processed, return current balance
         const currentBal = await tx.playerBalance.findUnique({
             where: { tableId_userId: { tableId, userId } }
         });
         return { success: true, newTableBalance: currentBal?.balanceCents ?? 0 };
      }

      // 2. Atomically debit only if bankroll is sufficient. This avoids
      // double-success races where two concurrent buy-ins read the same balance.
      const debitResult = await tx.user.updateMany({
        where: { id: userId, bankrollCents: { gte: amountCents } },
        data: { bankrollCents: { decrement: amountCents } },
      });
      if (debitResult.count !== 1) {
        throw new Error("INSUFFICIENT_BANKROLL");
      }

      // 4. Credit/Upsert PlayerBalance
      const pb = await tx.playerBalance.upsert({
        where: { tableId_userId: { tableId, userId } },
        create: {
          id: nanoid(),
          tableId,
          userId,
          balanceCents: amountCents,
          status: "ACTIVE",
        },
        update: {
          balanceCents: { increment: amountCents },
          status: "ACTIVE",
        },
      });

      // 5. Record Transaction
      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId,
          tableId,
          type: "BUYIN",
          amountCents,
          externalRef,
        },
      });

      return { success: true, newTableBalance: pb.balanceCents };
    });
  }

  /**
   * Cash Game Cash-Out
   * Atomically debits PlayerBalance and credits User.bankrollCents.
   */
  static async processCashGameCashOut(params: {
    userId: string;
    tableId: string;
    amountCents: number;
    externalRef: string;
    tableMeta: { name: string; creatorId?: string };
  }): Promise<{ success: boolean }> {
    const prisma = getPrisma();
    const { userId, tableId, amountCents, externalRef, tableMeta } = params;

    return await prisma.$transaction(async (tx: any) => {
       // Ensure FK target exists for BalanceTransaction writes.
       await CashierService.ensureTableExists(tx, tableId, tableMeta);

       // 1. Idempotency Check
       const existingTx = await tx.balanceTransaction.findUnique({
        where: { externalRef },
      });
      if (existingTx) {
          return { success: true };
      }

      // 2. Validate current table balance
      const pb = await tx.playerBalance.findUnique({
          where: { tableId_userId: { tableId, userId } }
      });

      if (!pb || pb.balanceCents < amountCents) {
          // In a forceful cashout (all-in), this shouldn't happen unless race condition
          // If we are cashing out *all*, amountCents should match pb.balanceCents
          throw new Error("INSUFFICIENT_TABLE_BALANCE"); 
      }

      // 3. Debit PlayerBalance (Set to 0 if full cashout, or decrement)
      // Usually cashout is "leave table", so we might want to set status too
      const remaining = pb.balanceCents - amountCents;
      await tx.playerBalance.update({
          where: { tableId_userId: { tableId, userId } },
          data: { 
              balanceCents: { decrement: amountCents },
              status: remaining === 0 ? "CASHED_OUT" : "ACTIVE"
          }
      });

      // 4. Credit User
      await tx.user.update({
          where: { id: userId },
          data: { bankrollCents: { increment: amountCents } }
      });

      // 5. Record Transaction
      await tx.balanceTransaction.create({
          data: {
              id: nanoid(),
              userId,
              tableId,
              type: "CASHOUT",
              amountCents,
              externalRef,
          }
      });

      return { success: true };
    });
  }

  /**
   * Tournament Register
   * Debits User.bankrollCents (Fee), Credits Tournament.prizePool (Fee).
   * Rake is implicitly handled if entryFee includes it, or separately if passed.
   * For now: entryFeeCents goes to prize pool.
   */
  static async processTournamentRegister(params: {
      userId: string;
      tournamentId: string;
      entryFeeCents: number;
      externalRef: string;
  }): Promise<{ success: boolean }> {
      const prisma = getPrisma();
      const { userId, tournamentId, entryFeeCents, externalRef } = params;

      return await prisma.$transaction(async (tx: any) => {
           // 1. Idempotency
           const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
           if(existingRef) return { success: true };

           // 2. Check Bankroll
           const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
           if (user.bankrollCents < entryFeeCents) {
               throw new Error("INSUFFICIENT_BANKROLL");
           }

           // 3. Check Tournament State
           const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId }});
           if (tourney.status !== "REGISTERING" && tourney.status !== "LATE_REG") {
               throw new Error("TOURNAMENT_CLOSED");
           }

           // 4. Debit User
           await tx.user.update({
               where: { id: userId },
               data: { bankrollCents: { decrement: entryFeeCents } }
           });

           // 5. Credit Tournament Prize Pool
           await tx.tournament.update({
               where: { id: tournamentId },
               data: { prizePoolCents: { increment: entryFeeCents } }
           });

           // 6. Create Registration
           await tx.tournamentRegistration.create({
               data: {
                   userId,
                   tournamentId,
                   entryTxId: externalRef
               }
           });

           // 7. Record Transaction
           await tx.balanceTransaction.create({
               data: {
                   id: nanoid(),
                   userId,
                   tournamentId,
                   type: "TOURNAMENT_ENTRY",
                   amountCents: entryFeeCents,
                   externalRef,
               }
           });

           return { success: true };
      });
  }
}

