import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "../engine/Dealer.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { PokerState } from "../state/PokerState.js";

type FakeClient = {
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
};

function makeClient(): FakeClient {
  return {
    send: vi.fn(),
    leave: vi.fn(),
  };
}

function makeState(tableId: string): PokerState {
  const state = new PokerState();
  state.tableId = tableId;
  state.tableName = tableId;
  state.maxSeats = 6;
  state.minBuyInCents = 1000;
  state.maxBuyInCents = 20000;
  state.street = "WAITING";
  return state;
}

function sumBankrolls(
  balances: Map<string, { bankroll: number }>,
): number {
  let bankroll = 0;
  for (const value of balances.values()) {
    bankroll += value.bankroll;
  }
  return bankroll;
}

async function settleToWaiting(dealer: Dealer, state: PokerState): Promise<void> {
  const deadline = Date.now() + 10_000;
  let guard = 0;
  while (state.street !== "WAITING" && Date.now() < deadline && guard < 200) {
    const toActUserId = state.seats[state.toActSeat];
    expect(toActUserId).toBeTruthy();
    if (!toActUserId) break;

    const options = (dealer as any).buildHeroActionOptions(toActUserId);
    if (options?.canCheck) {
      await dealer.handleAction(toActUserId, { action: "CHECK" });
    } else if (options?.canCall) {
      await dealer.handleAction(toActUserId, { action: "CALL" });
    } else if (options?.canFold) {
      await dealer.handleAction(toActUserId, { action: "FOLD" });
    } else {
      throw new Error("No legal passive action available while settling hand");
    }
    guard += 1;
  }
  expect(state.street).toBe("WAITING");
}

describe("money invariants", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("conserves bankroll and multi-player table chips across buy-in, rebuy, and cashout", async () => {
    const state = makeState("table_money_conservation");
    const dealer = new Dealer(state);

    const startingBankroll = 10000;
    const balances = new Map<string, { bankroll: number }>([
      ["u1", { bankroll: startingBankroll }],
      ["u2", { bankroll: startingBankroll }],
    ]);
    let tablePoolCents = 0;
    const initialTotalBankroll = startingBankroll * 2;

    const buyInSpy = vi.spyOn(CashierService, "processCashGameBuyIn").mockImplementation(async ({ userId, amountCents }) => {
      const balance = balances.get(userId);
      if (!balance) throw new Error("unknown user");
      if (balance.bankroll < amountCents) throw new Error("INSUFFICIENT_BANKROLL");
      balance.bankroll -= amountCents;
      tablePoolCents += amountCents;
      return { success: true, newTableBalance: amountCents };
    });

    const cashOutSpy = vi.spyOn(CashierService, "processCashGameCashOut").mockImplementation(async ({ userId, amountCents }) => {
      const balance = balances.get(userId);
      if (!balance) throw new Error("unknown user");
      if (tablePoolCents < amountCents) throw new Error("INSUFFICIENT_TABLE_BALANCE");
      tablePoolCents -= amountCents;
      balance.bankroll += amountCents;
      return { success: true };
    });

    await dealer.addPlayer("u1", "Alice", 2000);
    await dealer.addPlayer("u2", "Bob", 3000);
    await CashierService.processCashGameBuyIn({
      userId: "u1",
      tableId: state.tableId,
      amountCents: 1000,
      externalRef: "rebuy_money_inv_1",
      tableMeta: { name: state.tableName },
    });
    await dealer.applyRebuy("u1", 1000, "rebuy_money_inv_1");
    const midStacks = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0);
    const midPot = state.potCents;
    const midBankroll = sumBankrolls(balances);

    // Global table pool should equal on-table chips (live stacks + pot).
    expect(midStacks + midPot).toBe(tablePoolCents);
    // Global conservation across both players.
    expect(midBankroll + midStacks + midPot).toBe(initialTotalBankroll);

    await settleToWaiting(dealer, state);
    await dealer.handleConsentedLeave("u2");
    await dealer.handleConsentedLeave("u1");

    const finalStacks = [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0);
    const finalBankroll = sumBankrolls(balances);
    expect(tablePoolCents).toBe(0);
    expect(finalStacks).toBe(0);
    expect(finalBankroll).toBe(initialTotalBankroll);
    expect(finalBankroll + finalStacks).toBe(initialTotalBankroll);
    expect(buyInSpy).toHaveBeenCalledTimes(3);
    expect(cashOutSpy).toHaveBeenCalledTimes(2);
  });

  it("snapshot truth: rebuy snapshot stack equals dealer stack", async () => {
    const state = makeState("table_snapshot_truth");
    const dealer = new Dealer(state);
    const client = makeClient();
    dealer.bindClient("u1", client as any);

    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    await dealer.addPlayer("u1", "Alice", 5000);
    const p1 = state.playersById.get("u1")!;
    p1.stackCents = 0;
    p1.status = "OUT";

    await dealer.applyRebuy("u1", 2000, "rebuy_snapshot_truth_1");

    const snapshots = client.send.mock.calls
      .filter(([type]) => type === "TABLE_SNAPSHOT")
      .map(([, payload]) => payload as TableSnapshotPayload);
    const latest = snapshots[snapshots.length - 1];
    const seat = latest.seats.find((s) => s.userId === "u1");

    expect(seat).toBeDefined();
    expect(seat?.stackCents).toBe(p1.stackCents);
  });

  it("idempotent rebuy: same rebuyRef mutates stack exactly once", async () => {
    const state = makeState("table_rebuy_idempotent_invariant");
    const dealer = new Dealer(state);

    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });

    await dealer.addPlayer("u1", "Alice", 5000);
    const p1 = state.playersById.get("u1")!;
    p1.stackCents = 0;
    p1.status = "OUT";

    await dealer.applyRebuy("u1", 2000, "rebuy_ref_invariant");
    await dealer.applyRebuy("u1", 2000, "rebuy_ref_invariant");

    expect(p1.stackCents).toBe(2000);
  });
});
