import { getPrisma } from "@poker-champ/db";
import { nanoid } from "nanoid";
import {
  computeHumanPayoutAmountsByUserId,
  tournamentPayoutExternalRef,
} from "../../tournaments/tournament-payouts.js";
import {
  INSUFFICIENT_BANKROLL,
  NOT_REGISTERED,
  TOURNAMENT_CLOSED,
  TOURNAMENT_FULL,
  TOURNAMENT_NOT_CANCELLABLE,
} from "../../tournaments/tournament.errors.js";
import { isLateRegistrationOpen } from "../../tournaments/tournament-schedule.js";

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
      const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingRef) return { success: true };

      const existingReg = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      if (existingReg) return { success: true };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      const regOpen =
        tourney.status === "REGISTERING" ||
        tourney.status === "LATE_REG" ||
        isLateRegistrationOpen(tourney, new Date());
      if (!regOpen) {
        throw new Error(TOURNAMENT_CLOSED);
      }

      const regCount = await tx.tournamentRegistration.count({ where: { tournamentId } });
      if (regCount >= tourney.maxPlayers) {
        throw new Error(TOURNAMENT_FULL);
      }

      const debitResult = await tx.user.updateMany({
        where: { id: userId, bankrollCents: { gte: entryFeeCents } },
        data: { bankrollCents: { decrement: entryFeeCents } },
      });
      if (debitResult.count !== 1) {
        throw new Error(INSUFFICIENT_BANKROLL);
      }

      await tx.tournamentRegistration.create({
        data: {
          userId,
          tournamentId,
          entryTxId: externalRef,
        },
      });

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolCents: { increment: entryFeeCents } },
      });

      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId,
          tournamentId,
          type: "TOURNAMENT_ENTRY",
          amountCents: entryFeeCents,
          externalRef,
        },
      });

      return { success: true };
    });
  }

  /**
   * Bot tournament registration — no bankroll debit, no prize pool increment.
   */
  static async processTournamentBotRegister(params: {
    userId: string;
    tournamentId: string;
    externalRef: string;
  }): Promise<{ success: boolean }> {
    const prisma = getPrisma();
    const { userId, tournamentId, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingRef) return { success: true };

      const existingReg = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      if (existingReg) return { success: true };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (tourney.status !== "STARTING" && tourney.status !== "LATE_REG") {
        throw new Error(TOURNAMENT_CLOSED);
      }

      const regCount = await tx.tournamentRegistration.count({ where: { tournamentId } });
      if (regCount >= tourney.maxPlayers) {
        throw new Error(TOURNAMENT_FULL);
      }

      await tx.tournamentRegistration.create({
        data: {
          userId,
          tournamentId,
          isBot: true,
          entryTxId: externalRef,
        },
      });

      return { success: true };
    });
  }

  /**
   * Grant tournament starting stack at the table without debiting bankroll (entry fee already paid).
   */
  static async grantTournamentStartingStack(params: {
    userId: string;
    tableId: string;
    tournamentId: string;
    amountCents: number;
    externalRef: string;
    tableMeta: { name: string };
  }): Promise<{ stackCents: number }> {
    const prisma = getPrisma();
    const { userId, tableId, tournamentId, amountCents, externalRef, tableMeta } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingRef) {
        const pb = await tx.playerBalance.findUnique({
          where: { tableId_userId: { tableId, userId } },
        });
        return { stackCents: pb?.balanceCents ?? amountCents };
      }

      await CashierService.ensureTableExists(tx, tableId, tableMeta);

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
          balanceCents: amountCents,
          status: "ACTIVE",
        },
      });

      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId,
          tableId,
          tournamentId,
          type: "TOURNAMENT_SEAT",
          amountCents: 0,
          externalRef,
          metaJson: { startingStackCents: amountCents },
        },
      });

      return { stackCents: pb.balanceCents };
    });
  }

  /**
   * Tournament unregister — refunds entry fee to bankroll and removes registration.
   */
  static async processTournamentRefund(params: {
    userId: string;
    tournamentId: string;
    entryFeeCents: number;
    externalRef: string;
  }): Promise<{ success: boolean }> {
    const prisma = getPrisma();
    const { userId, tournamentId, entryFeeCents, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingRef) return { success: true };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      const regOpen =
        tourney.status === "REGISTERING" ||
        tourney.status === "LATE_REG" ||
        isLateRegistrationOpen(tourney, new Date());
      if (!regOpen) {
        throw new Error(TOURNAMENT_CLOSED);
      }

      const registration = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      if (!registration) {
        return { success: true };
      }

      await tx.tournamentRegistration.delete({
        where: { tournamentId_userId: { tournamentId, userId } },
      });

      if (!registration.isBot) {
        await tx.user.update({
          where: { id: userId },
          data: { bankrollCents: { increment: entryFeeCents } },
        });

        await tx.tournament.update({
          where: { id: tournamentId },
          data: { prizePoolCents: { decrement: entryFeeCents } },
        });

        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId,
            tournamentId,
            type: "REFUND",
            amountCents: entryFeeCents,
            externalRef,
          },
        });
      }

      return { success: true };
    });
  }

  /**
   * Admin cancel — refunds all registrations and marks tournament CANCELLED.
   */
  static async processTournamentCancel(params: {
    tournamentId: string;
    adminUserId: string;
    externalRef: string;
  }): Promise<{ success: boolean; refundedCount: number }> {
    const prisma = getPrisma();
    const { tournamentId, adminUserId, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existingCancel = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingCancel) {
        return { success: true, refundedCount: 0 };
      }

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (tourney.status === "CANCELLED") {
        return { success: true, refundedCount: 0 };
      }
      if (
        tourney.status !== "REGISTERING" &&
        tourney.status !== "LATE_REG" &&
        tourney.status !== "STARTING"
      ) {
        throw new Error(TOURNAMENT_NOT_CANCELLABLE);
      }

      const registrations = await tx.tournamentRegistration.findMany({
        where: { tournamentId },
      });

      if (registrations.length === 0) {
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { status: "CANCELLED", prizePoolCents: 0 },
        });
        return { success: true, refundedCount: 0 };
      }

      let refundedCount = 0;
      for (const reg of registrations) {
        if (reg.isBot) continue;

        const refundRef = `tournament_cancel_refund_${tournamentId}_${reg.userId}`;
        await tx.user.update({
          where: { id: reg.userId },
          data: { bankrollCents: { increment: tourney.entryFeeCents } },
        });

        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId: reg.userId,
            tournamentId,
            type: "REFUND",
            amountCents: tourney.entryFeeCents,
            externalRef: refundRef,
          },
        });
        refundedCount += 1;
      }

      await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status: "CANCELLED",
          prizePoolCents: 0,
        },
      });

      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId: adminUserId,
          tournamentId,
          type: "REFUND",
          amountCents: 0,
          externalRef,
          metaJson: { kind: "TOURNAMENT_CANCEL", refundedCount },
        },
      });

      return { success: true, refundedCount };
    });
  }

  /**
   * All humans eliminated — refund each human entry from prize pool; no payouts.
   */
  static async processTournamentAbandonRefunds(params: {
    tournamentId: string;
    externalRef: string;
  }): Promise<{ success: boolean; refundedCount: number }> {
    const prisma = getPrisma();
    const { tournamentId, externalRef } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existing = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existing) return { success: true, refundedCount: 0 };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (tourney.status !== "RUNNING") {
        return { success: true, refundedCount: 0 };
      }

      const registrations = await tx.tournamentRegistration.findMany({
        where: { tournamentId, isBot: false },
      });

      let refundedCount = 0;
      for (const reg of registrations) {
        const refundRef = `tournament_abandon_refund_${tournamentId}_${reg.userId}`;
        const existingRefund = await tx.balanceTransaction.findUnique({ where: { externalRef: refundRef } });
        if (existingRefund) {
          refundedCount += 1;
          continue;
        }

        await tx.user.update({
          where: { id: reg.userId },
          data: { bankrollCents: { increment: tourney.entryFeeCents } },
        });

        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId: reg.userId,
            tournamentId,
            type: "REFUND",
            amountCents: tourney.entryFeeCents,
            externalRef: refundRef,
            metaJson: { kind: "TOURNAMENT_ABANDON" },
          },
        });
        refundedCount += 1;
      }

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolCents: 0 },
      });

      if (registrations.length > 0) {
        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId: registrations[0]!.userId,
            tournamentId,
            type: "REFUND",
            amountCents: 0,
            externalRef,
            metaJson: { kind: "TOURNAMENT_ABANDON", refundedCount },
          },
        });
      }

      return { success: true, refundedCount };
    });
  }

  /**
   * Zero tournament table chips after bust without crediting bankroll.
   */
  static async forfeitTournamentTableBalance(params: {
    userId: string;
    tableId: string;
    tournamentId: string;
    externalRef: string;
    tableMeta: { name: string };
  }): Promise<{ success: boolean }> {
    const prisma = getPrisma();
    const { userId, tableId, tournamentId, externalRef, tableMeta } = params;

    return await prisma.$transaction(async (tx: any) => {
      const existingRef = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingRef) return { success: true };

      await CashierService.ensureTableExists(tx, tableId, tableMeta);

      await tx.playerBalance.updateMany({
        where: { tableId, userId },
        data: { balanceCents: 0, status: "CASHED_OUT" },
      });

      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId,
          tableId,
          tournamentId,
          type: "TOURNAMENT_BUST",
          amountCents: 0,
          externalRef,
        },
      });

      return { success: true };
    });
  }

  /**
   * Distribute prize pool to eligible humans by human finish order (bots ineligible).
   */
  static async processTournamentPayouts(params: {
    tournamentId: string;
    humanEntrantCount: number;
  }): Promise<{ success: boolean; paidCount: number }> {
    const prisma = getPrisma();
    const { tournamentId, humanEntrantCount } = params;

    return await prisma.$transaction(async (tx: any) => {
      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

      let prizePoolCents = tourney.prizePoolCents;
      if (prizePoolCents <= 0) {
        const paidSum = await tx.balanceTransaction.aggregate({
          where: { tournamentId, type: "TOURNAMENT_PAYOUT" },
          _sum: { amountCents: true },
        });
        prizePoolCents = paidSum._sum.amountCents ?? 0;
      }

      const humanRegs = await tx.tournamentRegistration.findMany({
        where: { tournamentId, isBot: false, finishPlace: { not: null } },
      });
      const humanFinishers = humanRegs
        .filter((r: { finishPlace: number | null }) => r.finishPlace != null)
        .map((r: { userId: string; finishPlace: number | null }) => ({
          userId: r.userId,
          finishPlace: r.finishPlace as number,
        }));

      const payoutsByUser = computeHumanPayoutAmountsByUserId(
        prizePoolCents,
        humanEntrantCount,
        humanFinishers,
      );

      let paidCount = 0;
      let payoutOrdinal = 0;
      for (const [userId, amountCents] of payoutsByUser.entries()) {
        if (amountCents <= 0) continue;
        payoutOrdinal += 1;
        const externalRef = tournamentPayoutExternalRef(tournamentId, payoutOrdinal, userId);
        const existing = await tx.balanceTransaction.findUnique({ where: { externalRef } });
        if (existing) {
          paidCount += 1;
          continue;
        }

        await tx.user.update({
          where: { id: userId },
          data: { bankrollCents: { increment: amountCents } },
        });

        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId,
            tournamentId,
            type: "TOURNAMENT_PAYOUT",
            amountCents,
            externalRef,
          },
        });

        paidCount += 1;
      }

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolCents: 0 },
      });

      return { success: true, paidCount };
    });
  }
}

