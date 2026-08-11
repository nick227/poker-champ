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
  TOURNAMENT_REBUY_NOT_ALLOWED,
} from "../../tournaments/tournament.errors.js";
import {
  canRegisterForTournament,
  canRebuyTournament,
  canUnregisterFromTournament,
} from "../../tournaments/tournament-schedule.js";
import {
  tournamentAbandonRefundExternalRef,
  tournamentCancelRefundExternalRef,
} from "../../tournaments/tournament.constants.js";
import { logger } from "../../lib/logger.js";

export const TABLE_NAME_REQUIRED = "TABLE_NAME_REQUIRED" as const;

/**
 * Default number of per-player refund transfers processed inside a single DB
 * transaction when batch-refunding a tournament field (cancel / abandon).
 * Keeping each transaction bounded avoids hitting the DB transaction timeout
 * on large fields, while each individual transfer remains atomic + idempotent
 * via its own deterministic externalRef so a retry after a partial failure
 * never double-refunds or drops a refund.
 */
const DEFAULT_REFUND_BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const boundedSize = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += boundedSize) {
    out.push(items.slice(i, i + boundedSize));
  }
  return out;
}

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
   * Tournament rebuy — debits bankroll, credits table stack, and adds to prize pool.
   */
  static async processTournamentRebuy(params: {
    userId: string;
    tableId: string;
    tournamentId: string;
    amountCents: number;
    externalRef: string;
    tableMeta: { name: string; creatorId?: string };
  }): Promise<{ success: boolean; newTableBalance: number }> {
    const prisma = getPrisma();
    const { userId, tableId, tournamentId, amountCents, externalRef, tableMeta } = params;

    return await prisma.$transaction(async (tx: any) => {
      await CashierService.ensureTableExists(tx, tableId, tableMeta);

      const existingTx = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingTx) {
        const currentBal = await tx.playerBalance.findUnique({
          where: { tableId_userId: { tableId, userId } },
        });
        return { success: true, newTableBalance: currentBal?.balanceCents ?? 0 };
      }

      const tournament = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      const registration = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
      });
      const rebuyCount = await tx.balanceTransaction.count({
        where: {
          tournamentId,
          userId,
          type: "BUYIN",
        },
      });
      if (!canRebuyTournament(tournament, { rebuyCount }, new Date())) {
        throw new Error(TOURNAMENT_REBUY_NOT_ALLOWED);
      }
      if (!registration || registration.isBot) {
        throw new Error(TOURNAMENT_CLOSED);
      }
      if (registration.finishPlace != null || registration.rebuyPendingAt == null) {
        throw new Error(TOURNAMENT_REBUY_NOT_ALLOWED);
      }

      // Re-verify and claim the registration row atomically, immediately before moving any
      // money. The plain read above can go stale: a concurrent explicit "leave tournament" call
      // (or the timeout sweep) can finalize this player as eliminated between that read and here.
      // updateMany's WHERE re-evaluates against the latest committed row under InnoDB's
      // semi-consistent read for UPDATE, so this and finalizeEliminatedRegistration's own guarded
      // updateMany race safely against each other: whichever write reaches the row lock first
      // wins, and the loser sees the winner's committed state and no-ops/throws here.
      const claimed = await tx.tournamentRegistration.updateMany({
        where: { tournamentId, userId, finishPlace: null, rebuyPendingAt: { not: null } },
        data: { rebuyPendingAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new Error(TOURNAMENT_REBUY_NOT_ALLOWED);
      }

      const debitResult = await tx.user.updateMany({
        where: { id: userId, bankrollCents: { gte: amountCents } },
        data: { bankrollCents: { decrement: amountCents } },
      });
      if (debitResult.count !== 1) {
        throw new Error("INSUFFICIENT_BANKROLL");
      }

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

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolCents: { increment: amountCents } },
      });

      await tx.balanceTransaction.create({
        data: {
          id: nanoid(),
          userId,
          tableId,
          tournamentId,
          type: "BUYIN",
          amountCents,
          externalRef,
          metaJson: { kind: "TOURNAMENT_REBUY" },
        },
      });

      await tx.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId, userId } },
        data: { rebuyPendingAt: null },
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

    // Real-money transfer: attempt-insert idempotency guard + atomic balance
    // guard, kept in one transaction so every step stays atomic together.
    // fallow-ignore-next-line complexity
    return await prisma.$transaction(async (tx: any) => {
       // Ensure FK target exists for BalanceTransaction writes.
       await CashierService.ensureTableExists(tx, tableId, tableMeta);

       // 1. Idempotency fast-path: if this externalRef already fully applied
       // (e.g. a genuine client retry after the first request's response was
       // lost), short-circuit without touching balances again.
       const existingTx = await tx.balanceTransaction.findUnique({
        where: { externalRef },
      });
      if (existingTx) {
          return { success: true };
      }

      // 2. Attempt-insert the transaction row *before* moving any money.
      // This claims the externalRef atomically via the unique constraint:
      // if two requests race on the exact same externalRef (a literal
      // double-submit), only one insert can win; the loser hits P2002 here
      // and returns "already applied" without ever touching the balance —
      // exactly like the buy-in path. If it fails for any other reason (or
      // if the balance turns out to be insufficient in step 3 below), the
      // whole transaction — including this insert — rolls back.
      try {
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
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
          return { success: true };
        }
        throw err;
      }

      // 3. Atomically debit only if the table balance is sufficient. Using
      // updateMany with a `gte` guard (instead of a plain read-then-write)
      // closes a race where two *different* cash-out requests for the same
      // player/table (e.g. two browser tabs both cashing out the full
      // stack) could both pass a balance check before either commits and
      // double-decrement/double-credit. This mirrors the atomic bankroll
      // debit already used in processCashGameBuyIn.
      const debitResult = await tx.playerBalance.updateMany({
          where: { tableId, userId, balanceCents: { gte: amountCents } },
          data: { balanceCents: { decrement: amountCents } },
      });
      if (debitResult.count !== 1) {
          // In a forceful cashout (all-in), this shouldn't happen unless race condition
          throw new Error("INSUFFICIENT_TABLE_BALANCE");
      }

      const pb = await tx.playerBalance.findUniqueOrThrow({
          where: { tableId_userId: { tableId, userId } }
      });
      if (pb.balanceCents === 0) {
        await tx.playerBalance.update({
            where: { tableId_userId: { tableId, userId } },
            data: { status: "CASHED_OUT" },
        });
      }

      // 4. Credit User
      await tx.user.update({
          where: { id: userId },
          data: { bankrollCents: { increment: amountCents } }
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
      if (!canRegisterForTournament(tourney, new Date())) {
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
      if (!canUnregisterFromTournament(tourney)) {
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
   *
   * Refunds are processed in bounded batches (each its own DB transaction)
   * rather than one transaction spanning the whole field, so a large field
   * cannot blow a single transaction's timeout. Each individual refund keeps
   * its own deterministic externalRef so it stays atomic + idempotent
   * regardless of batch boundaries: a crash/retry mid-run only re-processes
   * players who weren't refunded yet.
   */
  static async processTournamentCancel(params: {
    tournamentId: string;
    adminUserId: string;
    externalRef: string;
    batchSize?: number;
  }): Promise<{ success: boolean; refundedCount: number }> {
    const prisma = getPrisma();
    const { tournamentId, adminUserId, externalRef } = params;
    const batchSize = params.batchSize ?? DEFAULT_REFUND_BATCH_SIZE;

    // Step 1: idempotency + cancellability guard, snapshot the entry fee and
    // the eligible (non-bot) registrants. Cheap, single short transaction.
    // Guard-clause cascade (idempotency + tournament-status checks) needed
    // before it's safe to snapshot the refund field for batching below.
    // fallow-ignore-next-line complexity
    const setup = await prisma.$transaction(async (tx: any) => {
      const existingCancel = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingCancel) return { done: true as const, refundedCount: 0 };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (tourney.status === "CANCELLED") return { done: true as const, refundedCount: 0 };
      if (
        tourney.status !== "REGISTERING" &&
        tourney.status !== "LATE_REG" &&
        tourney.status !== "STARTING"
      ) {
        throw new Error(TOURNAMENT_NOT_CANCELLABLE);
      }

      const registrations = await tx.tournamentRegistration.findMany({
        where: { tournamentId, isBot: false },
        select: { userId: true },
      });

      return {
        done: false as const,
        entryFeeCents: tourney.entryFeeCents,
        userIds: registrations.map((r: { userId: string }) => r.userId),
      };
    });

    if (setup.done) {
      return { success: true, refundedCount: setup.refundedCount };
    }

    // Step 2: refund in bounded batches, one transaction per batch. Each
    // per-player refund checks its own externalRef first so re-running a
    // batch (e.g. after a crash) never double-credits.
    let refundedCount = 0;
    // Per-player check-then-write inside a bounded batch transaction; this
    // is the core Gap-1 fix and keeps each player's refund atomic per batch.
    for (const batch of chunk(setup.userIds as string[], batchSize)) {
      // fallow-ignore-next-line complexity
      refundedCount += await prisma.$transaction(async (tx: any) => {
        let batchRefunded = 0;
        for (const userId of batch) {
          const refundRef = tournamentCancelRefundExternalRef(tournamentId, userId);
          const existingRefund = await tx.balanceTransaction.findUnique({ where: { externalRef: refundRef } });
          if (existingRefund) {
            batchRefunded += 1;
            continue;
          }

          await tx.user.update({
            where: { id: userId },
            data: { bankrollCents: { increment: setup.entryFeeCents } },
          });

          await tx.balanceTransaction.create({
            data: {
              id: nanoid(),
              userId,
              tournamentId,
              type: "REFUND",
              amountCents: setup.entryFeeCents,
              externalRef: refundRef,
            },
          });
          batchRefunded += 1;
        }
        return batchRefunded;
      });
    }

    // Step 3: mark the tournament CANCELLED and write the outer idempotency
    // marker. Guarded again so a retried run that reached this point before
    // (but crashed before committing) is safe to re-run.
    await prisma.$transaction(async (tx: any) => {
      const existingCancel = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existingCancel) return;

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: "CANCELLED", prizePoolCents: 0 },
      });

      try {
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
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== "P2002") throw err;
      }
    });

    return { success: true, refundedCount };
  }

  /**
   * All humans eliminated — refund each human entry from prize pool; no payouts.
   *
   * Same bounded-batch approach as processTournamentCancel: refunds run in
   * chunks of `batchSize`, each its own transaction, so a large field cannot
   * exceed the DB transaction timeout. Per-player idempotency (check-before-
   * write on a deterministic externalRef) is unchanged from before.
   */
  static async processTournamentAbandonRefunds(params: {
    tournamentId: string;
    externalRef: string;
    batchSize?: number;
  }): Promise<{ success: boolean; refundedCount: number }> {
    const prisma = getPrisma();
    const { tournamentId, externalRef } = params;
    const batchSize = params.batchSize ?? DEFAULT_REFUND_BATCH_SIZE;

    // Same idempotency + status guard shape as processTournamentCancel's
    // setup step; see that method's comment for the single-transaction why.
    // fallow-ignore-next-line complexity
    const setup = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existing) return { done: true as const, refundedCount: 0 };

      const tourney = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (tourney.status !== "RUNNING") {
        return { done: true as const, refundedCount: 0 };
      }

      const registrations = await tx.tournamentRegistration.findMany({
        where: { tournamentId, isBot: false },
        select: { userId: true },
      });

      return {
        done: false as const,
        entryFeeCents: tourney.entryFeeCents,
        userIds: registrations.map((r: { userId: string }) => r.userId),
      };
    });

    if (setup.done) {
      return { success: true, refundedCount: setup.refundedCount };
    }

    let refundedCount = 0;
    // Per-player idempotency check-then-write inside a bounded batch
    // transaction; see processTournamentCancel's equivalent batch step.
    for (const batch of chunk(setup.userIds as string[], batchSize)) {
      // fallow-ignore-next-line complexity
      refundedCount += await prisma.$transaction(async (tx: any) => {
        let batchRefunded = 0;
        for (const userId of batch) {
          const refundRef = tournamentAbandonRefundExternalRef(tournamentId, userId);
          const existingRefund = await tx.balanceTransaction.findUnique({ where: { externalRef: refundRef } });
          if (existingRefund) {
            batchRefunded += 1;
            continue;
          }

          await tx.user.update({
            where: { id: userId },
            data: { bankrollCents: { increment: setup.entryFeeCents } },
          });

          await tx.balanceTransaction.create({
            data: {
              id: nanoid(),
              userId,
              tournamentId,
              type: "REFUND",
              amountCents: setup.entryFeeCents,
              externalRef: refundRef,
              metaJson: { kind: "TOURNAMENT_ABANDON" },
            },
          });
          batchRefunded += 1;
        }
        return batchRefunded;
      });
    }

    await prisma.$transaction(async (tx: any) => {
      const existing = await tx.balanceTransaction.findUnique({ where: { externalRef } });
      if (existing) return;

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolCents: 0 },
      });

      if (setup.userIds.length > 0) {
        try {
          await tx.balanceTransaction.create({
            data: {
              id: nanoid(),
              userId: setup.userIds[0]!,
              tournamentId,
              type: "REFUND",
              amountCents: 0,
              externalRef,
              metaJson: { kind: "TOURNAMENT_ABANDON", refundedCount },
            },
          });
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          if (code !== "P2002") throw err;
        }
      }
    });

    return { success: true, refundedCount };
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

      try {
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
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== "P2002") throw err;
      }

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

  /**
   * Bounded retry-with-backoff for the "sync the live room after a buy-in
   * commit" step. By the time this runs, the bankroll debit + PlayerBalance
   * credit (processCashGameBuyIn / processTournamentRebuy) has already
   * committed — there's no safe automatic rollback of paid-for chips once a
   * player may be relying on them, so on transient failure we retry a few
   * times with backoff, and if still failing, durably mark the originating
   * BalanceTransaction so an operator can find and manually reconcile the
   * "paid but not seated" buy-in instead of it being silently invisible.
   */
  // Bounded retry loop with backoff + dead-letter fallback (Gap 3): attempt
  // loop, per-attempt catch/backoff, and the final dead-letter call.
  // fallow-ignore-next-line complexity
  static async syncRoomAfterBuyIn(params: {
    userId: string;
    tableId: string;
    externalRef: string;
    roomSync: () => Promise<void>;
    maxAttempts?: number;
    baseDelayMs?: number;
  }): Promise<{ synced: boolean; attempts: number }> {
    const maxAttempts = Math.max(1, params.maxAttempts ?? 3);
    const baseDelayMs = params.baseDelayMs ?? 200;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await params.roomSync();
        return { synced: true, attempts: attempt };
      } catch (err) {
        lastErr = err;
        logger.warn(
          {
            err,
            attempt,
            maxAttempts,
            userId: params.userId,
            tableId: params.tableId,
            externalRef: params.externalRef,
          },
          "BUYIN_ROOM_SYNC_ATTEMPT_FAILED",
        );
        if (attempt < maxAttempts) {
          const delayMs = baseDelayMs * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    await CashierService.markBuyInRoomSyncFailed({
      userId: params.userId,
      tableId: params.tableId,
      externalRef: params.externalRef,
      attempts: maxAttempts,
      lastError: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });

    return { synced: false, attempts: maxAttempts };
  }

  /**
   * Durable dead-letter marker for a buy-in whose funds committed but whose
   * live-room sync never succeeded. Reuses the BalanceTransaction row the
   * buy-in itself created (found via its externalRef) instead of inventing a
   * new queue/table, so an admin sweep can filter on metaJson.roomSyncStatus.
   */
  // Best-effort dead-letter writer; branches are defensive (missing
  // transaction row, non-object metaJson, write failure) so a bug here can
  // never mask the caller's original room-sync error.
  // fallow-ignore-next-line complexity
  private static async markBuyInRoomSyncFailed(params: {
    userId: string;
    tableId: string;
    externalRef: string;
    attempts: number;
    lastError: string;
  }): Promise<void> {
    const prisma = getPrisma();
    try {
      const existing = await prisma.balanceTransaction.findUnique({
        where: { externalRef: params.externalRef },
      });
      if (!existing) {
        logger.error({ ...params }, "BUYIN_ROOM_SYNC_DEAD_LETTER_MISSING_TRANSACTION");
        return;
      }
      const priorMeta =
        existing.metaJson && typeof existing.metaJson === "object" && !Array.isArray(existing.metaJson)
          ? (existing.metaJson as Record<string, unknown>)
          : {};
      await prisma.balanceTransaction.update({
        where: { externalRef: params.externalRef },
        data: {
          metaJson: {
            ...priorMeta,
            roomSyncStatus: "FAILED",
            roomSyncAttempts: params.attempts,
            roomSyncLastError: params.lastError,
            roomSyncFailedAt: new Date().toISOString(),
          },
        },
      });
      logger.error(
        {
          userId: params.userId,
          tableId: params.tableId,
          externalRef: params.externalRef,
          attempts: params.attempts,
        },
        "BUYIN_ROOM_SYNC_DEAD_LETTER_RECORDED",
      );
    } catch (err) {
      // Best-effort: dead-letter bookkeeping must never mask the original
      // room-sync failure from the caller.
      logger.error({ err, ...params }, "BUYIN_ROOM_SYNC_DEAD_LETTER_WRITE_FAILED");
    }
  }
}

