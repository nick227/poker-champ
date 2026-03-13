import { Prisma, type PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import type { Street } from "../../state/PokerState.js";

/**
 * LedgerService - Sole Authority for In-Hand Chip Movement
 * 
 * Responsibilities:
 * - Manage PlayerBalance.balanceCents for in-hand transactions
 * - Create comprehensive BalanceTransaction audit trail
 * - Enforce hand balance (debits = credits)
 * - Use deterministic externalRef for crash recovery
 * 
 * Rules:
 * - NEVER touches User.bankrollCents (that's CashierService's job)
 * - ALL in-hand chip movements must go through this service
 * - Dealer must use returned balance to set PlayerState.stackCents
 * - PlayerState.stackCents is a read-only mirror of PlayerBalance
 */
export class LedgerService {
  constructor(private prisma: PrismaClient, private tableId: string) {}

  /**
   * Get current balance for a user at this table
   */
  async getBalance(userId: string): Promise<number> {
    const bal = await this.prisma.playerBalance.findUnique({
      where: { tableId_userId: { tableId: this.tableId, userId } },
      select: { balanceCents: true },
    });
    return bal?.balanceCents ?? 0;
  }

  /**
   * Ensure PlayerBalance records exist for all users
   * Called at table join (after CashierService buy-in)
   */
  async ensureBalances(userIds: string[], initialBalanceByUserId: Record<string, number>) {
    for (const userId of userIds) {
      await this.prisma.playerBalance.upsert({
        where: { tableId_userId: { tableId: this.tableId, userId } },
        create: {
          id: nanoid(),
          tableId: this.tableId,
          userId,
          balanceCents: initialBalanceByUserId[userId] ?? 0,
          status: "ACTIVE",
        },
        update: {},
      });
    }
  }

  /**
   * Post blind (SB or BB)
   * Returns new balance
   */
  async postBlind(params: {
    userId: string;
    handId: string;
    blindType: "SB" | "BB";
    amountCents: number;
  }): Promise<number> {
    const externalRef = `blind_${params.blindType.toLowerCase()}_${this.tableId}_${params.userId}_${params.handId}`;
    
    return await this.debit({
      userId: params.userId,
      handId: params.handId,
      type: `BLIND_${params.blindType}`,
      amountCents: params.amountCents,
      externalRef,
    });
  }

  /**
   * Debit for bet, raise, call, or all-in
   * Returns new balance
   */
  async debitBet(params: {
    userId: string;
    handId: string;
    street: Street;
    action: "BET" | "RAISE" | "CALL" | "ALL_IN";
    amountCents: number;
    sequenceNum: number;
  }): Promise<number> {
    const externalRef = `${params.action.toLowerCase()}_${this.tableId}_${params.userId}_${params.handId}_${params.street.toLowerCase()}_${params.sequenceNum}`;
    
    return await this.debit({
      userId: params.userId,
      handId: params.handId,
      type: params.action,
      amountCents: params.amountCents,
      externalRef,
      metaJson: { street: params.street, sequenceNum: params.sequenceNum },
    });
  }

  /**
   * Credit refund (e.g., uncalled bet)
   * Returns new balance
   */
  async creditRefund(params: {
    userId: string;
    handId: string;
    amountCents: number;
    reason: string;
  }): Promise<number> {
    const externalRef = `refund_${this.tableId}_${params.userId}_${params.handId}`;
    
    return await this.credit({
      userId: params.userId,
      handId: params.handId,
      type: "REFUND",
      amountCents: params.amountCents,
      externalRef,
      metaJson: { reason: params.reason },
    });
  }

  /**
   * Credit payout from pot
   * Returns new balance
   */
  async creditPayout(params: {
    userId: string;
    handId: string;
    amountCents: number;
    potIndex?: number;
  }): Promise<number> {
    const potSuffix = params.potIndex !== undefined ? `_pot${params.potIndex}` : "";
    const externalRef = `payout_${this.tableId}_${params.userId}_${params.handId}${potSuffix}`;
    
    return await this.credit({
      userId: params.userId,
      handId: params.handId,
      type: "PAYOUT",
      amountCents: params.amountCents,
      externalRef,
      metaJson: params.potIndex !== undefined ? { potIndex: params.potIndex } : undefined,
    });
  }

  /**
   * Assert that hand is balanced (total debits = total credits)
   * Throws error if not balanced.
   * Only considers in-hand transaction types.
   */
  async assertHandBalanced(handId: string): Promise<void> {
    const handTypes = [
      "BLIND_SB",
      "BLIND_BB",
      "BET",
      "RAISE",
      "CALL",
      "ALL_IN",
      "REFUND",
      "PAYOUT",
    ];

    const txs = await this.prisma.balanceTransaction.findMany({
      where: { 
        tableId: this.tableId, 
        handId,
        type: { in: handTypes }
      },
    });

    const sum = txs.reduce((acc: number, tx: any) => acc + tx.amountCents, 0);

    if (sum !== 0) {
      const history = txs.map((t: any) => `${t.type}:${t.userId}:${t.amountCents}`).join(", ");
      const msg = `LEDGER_MISMATCH: Hand ${handId} is unbalanced by ${sum} cents. History: [${history}]`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  /**
   * Internal: Debit operation
   * Negative amountCents, decreases balance
   */
  private async debit(params: {
    userId: string;
    handId: string;
    type: string;
    amountCents: number;
    externalRef: string;
    metaJson?: any;
  }): Promise<number> {
    return await this.applyTransaction({
      ...params,
      amountCents: -Math.abs(params.amountCents), // Ensure negative
    });
  }

  /**
   * Internal: Credit operation
   * Positive amountCents, increases balance
   */
  private async credit(params: {
    userId: string;
    handId: string;
    type: string;
    amountCents: number;
    externalRef: string;
    metaJson?: any;
  }): Promise<number> {
    return await this.applyTransaction({
      ...params,
      amountCents: Math.abs(params.amountCents), // Ensure positive
    });
  }

  /**
   * Internal: Apply transaction with idempotency
   */
  private async applyTransaction(params: {
    userId: string;
    handId: string;
    type: string;
    amountCents: number;
    externalRef: string;
    metaJson?: any;
  }): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.balanceTransaction.findUnique({
          where: { externalRef: params.externalRef },
        });

        if (existing) {
          const balance = await tx.playerBalance.findUnique({
            where: { tableId_userId: { tableId: this.tableId, userId: params.userId } },
            select: { balanceCents: true },
          });
          return balance?.balanceCents ?? 0;
        }

        await tx.playerBalance.upsert({
          where: { tableId_userId: { tableId: this.tableId, userId: params.userId } },
          create: {
            id: nanoid(),
            tableId: this.tableId,
            userId: params.userId,
            balanceCents: 0,
            status: "ACTIVE",
          },
          update: {},
        });

        let nextBalance: number;
        if (params.amountCents >= 0) {
          const updated = await tx.playerBalance.update({
            where: { tableId_userId: { tableId: this.tableId, userId: params.userId } },
            data: { balanceCents: { increment: params.amountCents } },
            select: { balanceCents: true },
          });
          nextBalance = updated.balanceCents;
        } else {
          const debitAmount = Math.abs(params.amountCents);
          // updateMany lets us enforce balance >= debitAmount in the write itself.
          // It only returns a count, so we re-read the row to get the new balance.
          // That read is still safe here because both statements are inside one transaction.
          const updated = await tx.playerBalance.updateMany({
            where: {
              tableId: this.tableId,
              userId: params.userId,
              balanceCents: { gte: debitAmount },
            },
            data: { balanceCents: { decrement: debitAmount } },
          });
          if (updated.count !== 1) {
            const balance = await tx.playerBalance.findUnique({
              where: { tableId_userId: { tableId: this.tableId, userId: params.userId } },
              select: { balanceCents: true },
            });
            const current = balance?.balanceCents ?? 0;
            throw new Error(
              `INSUFFICIENT_BALANCE: User ${params.userId} has ${current} cents, cannot debit ${debitAmount} cents`
            );
          }
          const balance = await tx.playerBalance.findUnique({
            where: { tableId_userId: { tableId: this.tableId, userId: params.userId } },
            select: { balanceCents: true },
          });
          nextBalance = balance?.balanceCents ?? 0;
        }

        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            tableId: this.tableId,
            userId: params.userId,
            handId: params.handId,
            type: params.type,
            amountCents: params.amountCents,
            externalRef: params.externalRef,
            metaJson: params.metaJson ?? undefined,
          },
        });

        return nextBalance;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return await this.getBalance(params.userId);
      }
      throw err;
    }
  }

  /**
   * DEPRECATED: Use specific methods instead
   * Kept for backward compatibility during migration
   */
  async applyTx(params: {
    userId: string;
    handId?: string;
    kind: string;
    deltaCents: number;
    meta?: any;
  }) {
    console.warn("LedgerService.applyTx() is deprecated. Use specific methods like postBlind(), debitBet(), etc.");
    
    const externalRef = `legacy_${this.tableId}_${params.userId}_${params.handId}_${Date.now()}`;
    
    return await this.applyTransaction({
      userId: params.userId,
      handId: params.handId ?? "unknown",
      type: params.kind,
      amountCents: params.deltaCents,
      externalRef,
      metaJson: params.meta,
    });
  }
}
