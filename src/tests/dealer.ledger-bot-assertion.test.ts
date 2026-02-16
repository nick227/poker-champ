import { afterEach, describe, expect, it } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { PokerState } from "../state/PokerState.js";
import type { PlayerState } from "../state/PlayerState.js";

type LedgerTx = {
  handId: string;
  amountCents: number;
};

class FakeLedgeredPersistence {
  enabled = true;
  handHistory = null;
  ledger = {};
  txs: LedgerTx[] = [];
  assertCalls: string[] = [];

  private isLedgerParticipant(player: PlayerState): boolean {
    return player.kind === "HUMAN";
  }

  async postBlind(params: {
    handId: string;
    amountCents: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (this.isLedgerParticipant(params.player)) {
      this.txs.push({ handId: params.handId, amountCents: -Math.abs(params.amountCents) });
    }
    return params.currentBalance - params.amountCents;
  }

  async debitBet(params: {
    handId: string;
    amountCents: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (this.isLedgerParticipant(params.player)) {
      this.txs.push({ handId: params.handId, amountCents: -Math.abs(params.amountCents) });
    }
    return params.currentBalance - params.amountCents;
  }

  async creditRefund(params: {
    handId: string;
    amountCents: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (this.isLedgerParticipant(params.player)) {
      this.txs.push({ handId: params.handId, amountCents: Math.abs(params.amountCents) });
    }
    return params.currentBalance + params.amountCents;
  }

  async creditPayout(params: {
    handId: string;
    amountCents: number;
    currentBalance: number;
    player: PlayerState;
  }): Promise<number> {
    if (this.isLedgerParticipant(params.player)) {
      this.txs.push({ handId: params.handId, amountCents: Math.abs(params.amountCents) });
    }
    return params.currentBalance + params.amountCents;
  }

  async assertHandBalanced(handId: string): Promise<void> {
    this.assertCalls.push(handId);
    const delta = this.txs
      .filter((tx) => tx.handId === handId)
      .reduce((sum, tx) => sum + tx.amountCents, 0);
    if (delta !== 0) {
      throw new Error(`LEDGER_MISMATCH:${handId}:${delta}`);
    }
  }
}

describe("dealer ledger assertion with bot participants", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  });

  it("does not assert hand balance for mixed human+bot hands", async () => {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const state = new PokerState();
    state.maxSeats = 6;
    state.smallBlindCents = 100;
    state.bigBlindCents = 200;
    state.minBuyInCents = 1000;
    state.maxBuyInCents = 10000;

    const persistence = new FakeLedgeredPersistence();
    const dealer = new Dealer(state, persistence as any);

    await dealer.addPlayer("user_human", "Human", 5000);
    await dealer.addBot("bot_1", "Bot", 5000);

    const handId = state.handId;
    expect(handId).toBeTruthy();

    const toActId = state.seats[state.toActSeat];
    expect(toActId).toBe("user_human");

    await expect(dealer.handleAction("user_human", { action: "FOLD" })).resolves.toBeUndefined();
    expect(persistence.assertCalls).toHaveLength(0);
  });
});
