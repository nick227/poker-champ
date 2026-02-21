import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../../db/prisma.js";
import { HandHistoryService } from "./HandHistoryService.js";
import { LedgerService } from "./LedgerService.js";
import { logger } from "../../lib/logger.js";
import type { Street } from "../../state/PokerState.js";
import type { PlayerState } from "../../state/PlayerState.js";
import { isLedgerParticipant } from "./ledgerHelpers.js";

/**
 * Persistence facade:
 * - If DATABASE_URL is missing, acts as no-op.
 * - Keeps engine runnable without DB.
 * 
 * Phase 3 - Ledger Authority:
 * This facade remains the entry point for the Dealer, but delegates all 
 * in-hand transactions to LedgerService. It provides in-memory fallbacks
 * if the database is disabled.
 */
export class PersistenceFacade {
  readonly enabled: boolean;
  readonly prisma: PrismaClient | null;
  readonly handHistory: HandHistoryService | null;
  readonly ledger: LedgerService | null;

  constructor(private tableId: string) {
    const hasDb = !!process.env.DATABASE_URL && process.env.NODE_ENV !== "test";
    this.enabled = hasDb;

    if (!hasDb) {
      this.prisma = null;
      this.handHistory = null;
      this.ledger = null;
      return;
    }

    const prisma = getPrisma();
    this.prisma = prisma;
    this.handHistory = new HandHistoryService(prisma, tableId);
    this.ledger = new LedgerService(prisma, tableId);
  }

  /**
   * Post blind (SB or BB)
   * If DB disabled or bot, returns currentBalance - amountCents
   */
  async postBlind(params: {
    userId: string;
    handId: string;
    blindType: "SB" | "BB";
    amountCents: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (!isLedgerParticipant(params.player)) return params.currentBalance - params.amountCents;
    if (!this.enabled || !this.ledger) return params.currentBalance - params.amountCents;
    try {
      return await this.ledger.postBlind(params);
    } catch (err) {
      logger.error({ err, userId: params.userId, handId: params.handId }, "postBlind failed");
      throw err;
    }
  }

  /**
   * Debit for bet, raise, call, or all-in
   */
  async debitBet(params: {
    userId: string;
    handId: string;
    street: Street;
    action: "BET" | "RAISE" | "CALL" | "ALL_IN";
    amountCents: number;
    sequenceNum: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (!isLedgerParticipant(params.player)) return params.currentBalance - params.amountCents;
    if (!this.enabled || !this.ledger) return params.currentBalance - params.amountCents;
    try {
      const { player, ...ledgerParams } = params;
      return await this.ledger.debitBet(ledgerParams);
    } catch (err) {
      logger.error({ err, userId: params.userId, handId: params.handId }, "debitBet failed");
      throw err;
    }
  }

  /**
   * Credit refund (e.g., uncalled bet)
   */
  async creditRefund(params: {
    userId: string;
    handId: string;
    amountCents: number;
    reason: string;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (!isLedgerParticipant(params.player)) return params.currentBalance + params.amountCents;
    if (!this.enabled || !this.ledger) return params.currentBalance + params.amountCents;
    try {
      const { player, ...ledgerParams } = params;
      return await this.ledger.creditRefund(ledgerParams);
    } catch (err) {
      logger.error({ err, userId: params.userId, handId: params.handId }, "creditRefund failed");
      throw err;
    }
  }

  /**
   * Credit payout from pot
   */
  async creditPayout(params: {
    userId: string;
    handId: string;
    amountCents: number;
    potIndex?: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (!isLedgerParticipant(params.player)) return params.currentBalance + params.amountCents;
    if (!this.enabled || !this.ledger) return params.currentBalance + params.amountCents;
    try {
      const { player, ...ledgerParams } = params;
      return await this.ledger.creditPayout(ledgerParams);
    } catch (err) {
      logger.error({ err, userId: params.userId, handId: params.handId }, "creditPayout failed");
      throw err;
    }
  }

  async assertHandBalanced(handId: string): Promise<void> {
    if (!this.enabled || !this.ledger) return;
    try {
      await this.ledger.assertHandBalanced(handId);
    } catch (err) {
      logger.warn({ err, tableId: this.tableId, handId }, "ledger assertion failed");
      // In many environments we log but don't crash the server.
      // But Phase 3 says "fail hard if debits != credits".
      // We will re-throw here so the Dealer/Room can handle it.
      throw err;
    }
  }

  // DEPRECATED Legacy methods
  async applyBankrollEvent(params: {
    userId: string;
    handId?: string;
    kind: string;
    deltaCents: number;
    meta?: any;
  }): Promise<number | null> {
    if (!this.enabled || !this.ledger) return null;
    return await this.ledger.applyTx(params);
  }

  async debitPlayer(params: {
    userId: string;
    handId?: string;
    kind: string;
    amountCents: number;
    meta?: any;
  }): Promise<number | null> {
    if (!this.enabled || !this.ledger) return null;
    return await this.applyBankrollEvent({
      ...params,
      deltaCents: -Math.abs(params.amountCents),
    });
  }

  async creditPlayer(params: {
    userId: string;
    handId?: string;
    kind: string;
    amountCents: number;
    meta?: any;
  }): Promise<number | null> {
    if (!this.enabled || !this.ledger) return null;
    return await this.applyBankrollEvent({
      ...params,
      deltaCents: Math.abs(params.amountCents),
    });
  }
}
