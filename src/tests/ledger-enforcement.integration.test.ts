import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { CashierService } from "../engine/economy/CashierService.js";

type Tx = {
  playerId: string;
  handId?: string;
  kind: string;
  deltaCents: number;
};

class MemoryPersistence {
  enabled = true;
  handHistory = null;
  ledger = null;
  txs: Tx[] = [];
  balances = new Map<string, number>();

  async applyBankrollEvent(params: {
    playerId: string;
    handId?: string;
    kind: string;
    deltaCents: number;
  }) {
    const cur = this.balances.get(params.playerId) ?? 0;
    const next = cur + params.deltaCents;
    if (next < 0) throw new Error(`INSUFFICIENT_BALANCE:${params.playerId}`);
    this.balances.set(params.playerId, next);
    this.txs.push(params);
    return next;
  }

  async debitPlayer(params: {
    playerId: string;
    handId?: string;
    kind: string;
    amountCents: number;
  }) {
    return await this.applyBankrollEvent({
      playerId: params.playerId,
      handId: params.handId,
      kind: params.kind,
      deltaCents: -Math.abs(params.amountCents),
    });
  }

  async creditPlayer(params: {
    playerId: string;
    handId?: string;
    kind: string;
    amountCents: number;
  }) {
    return await this.applyBankrollEvent({
      playerId: params.playerId,
      handId: params.handId,
      kind: params.kind,
      deltaCents: Math.abs(params.amountCents),
    });
  }

  async assertHandBalanced(handId: string) {
    const delta = this.txs
      .filter((tx) => tx.handId === handId)
      .reduce((sum, tx) => sum + tx.deltaCents, 0);
    if (delta !== 0) throw new Error(`LEDGER_MISMATCH:${handId}:${delta}`);
  }

  private ensureBalance(playerId: string, currentBalance: number) {
    if (!this.balances.has(playerId)) {
      this.balances.set(playerId, currentBalance);
    }
  }

  async postBlind(params: {
    userId: string;
    handId?: string;
    amountCents: number;
    currentBalance: number;
    action: "POST_SB" | "POST_BB";
  }) {
    this.ensureBalance(params.userId, params.currentBalance);
    const next = await this.debitPlayer({
      playerId: params.userId,
      handId: params.handId,
      kind: params.action,
      amountCents: params.amountCents,
    });
    return next;
  }

  async debitBet(params: {
    userId: string;
    handId?: string;
    amountCents: number;
    action: "BET" | "RAISE" | "CALL" | "ALL_IN";
    currentBalance: number;
  }) {
    this.ensureBalance(params.userId, params.currentBalance);
    const next = await this.debitPlayer({
      playerId: params.userId,
      handId: params.handId,
      kind: params.action,
      amountCents: params.amountCents,
    });
    return next;
  }

  async creditPayout(params: {
    userId: string;
    handId?: string;
    amountCents: number;
    currentBalance: number;
  }) {
    this.ensureBalance(params.userId, params.currentBalance);
    const next = await this.creditPlayer({
      playerId: params.userId,
      handId: params.handId,
      kind: "PAYOUT",
      amountCents: params.amountCents,
    });
    return next;
  }
}

describe("ledger enforcement", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps per-hand ledger balanced for fold-win path", async () => {
    const state = new PokerState();
    state.maxSeats = 6;
    state.minBuyInCents = 1000;
    state.maxBuyInCents = 10000;

    const persistence = new MemoryPersistence();
    const dealer = new Dealer(state, persistence as any);

    await dealer.addPlayer("p1", "A", 5000);
    await dealer.addPlayer("p2", "B", 5000);

    const handId = state.handId;
    const toActId = state.seats[state.toActSeat]!;
    await dealer.handleAction(toActId, { action: "FOLD" });

    const started = Date.now();
    while (state.handId === handId && Date.now() - started < 12000) {
      await new Promise((r) => setTimeout(r, 25));
    }
    await persistence.assertHandBalanced(handId);
  }, 15000);

  it("keeps per-hand ledger balanced for all-in sidepot showdown path", async () => {
    const state = new PokerState();
    state.maxSeats = 6;
    state.minBuyInCents = 500;
    state.maxBuyInCents = 10000;

    const persistence = new MemoryPersistence();
    const dealer = new Dealer(state, persistence as any);

    await dealer.addPlayer("p1", "A", 1200);
    await dealer.addPlayer("p2", "B", 2500);
    await dealer.addPlayer("p3", "C", 4200);

    const handId = state.handId;
    for (let i = 0; i < 20 && state.handId === handId && state.street !== "WAITING"; i++) {
      const toActId = state.seats[state.toActSeat];
      if (!toActId) break;
      await dealer.handleAction(toActId, { action: "ALL_IN" });
    }

    await new Promise((r) => setTimeout(r, 50));
    await persistence.assertHandBalanced(handId);
  }, 20000);

  it("supports refund credit path without creating money", async () => {
    const persistence = new MemoryPersistence();

    await persistence.creditPlayer({ playerId: "p1", kind: "BUYIN", amountCents: 5000 });
    await persistence.debitPlayer({ playerId: "p1", handId: "h1", kind: "POST_SB", amountCents: 100 });
    await persistence.creditPlayer({ playerId: "p1", handId: "h1", kind: "REFUND", amountCents: 100 });

    await persistence.assertHandBalanced("h1");
    expect(persistence.balances.get("p1")).toBe(5000);
  });
});
