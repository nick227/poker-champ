
import { getPrisma } from "../../db/prisma.js";
import { nanoid } from "nanoid";

export class CashierService {
  /**
   * Cash Game Buy-In
   * Atomically debits User.bankrollCents and credits PlayerBalance.
   */
  static async processCashGameBuyIn(params: {
    userId: string;
    tableId: string;
    amountCents: number;
    externalRef: string;
  }): Promise<{ success: boolean; newTableBalance: number }> {
    const prisma = getPrisma();
    const { userId, tableId, amountCents, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
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

      // 2. Refresh User & Check Bankroll
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.bankrollCents < amountCents) {
        throw new Error("INSUFFICIENT_BANKROLL");
      }

      // 3. Debit User
      try {
        await tx.user.update({
          where: { id: userId },
          data: { bankrollCents: { decrement: amountCents } },
        });
      } catch (err: any) {
        // If the DB check constraint triggers (MySQL error 3819 or P2010/P2002)
        if (err.message?.includes("check_bankroll_non_negative") || err.code === "P2010" || err.code === "P2002") {
          throw new Error("INSUFFICIENT_BANKROLL");
        }
        throw err;
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
  }): Promise<{ success: boolean }> {
    const prisma = getPrisma();
    const { userId, tableId, amountCents, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
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
