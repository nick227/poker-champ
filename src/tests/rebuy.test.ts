import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerState } from "../state/PokerState.js";
import { Dealer } from "../engine/Dealer.js";
import { CashierService } from "../engine/economy/CashierService.js";

describe("rebuy", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds chips to seated player with zero stack and sets ACTIVE when street is WAITING", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    const p1 = state.playersById.get("u1");
    expect(p1).toBeDefined();
    state.street = "WAITING";
    p1!.stackCents = 0;
    p1!.status = "OUT";
    p1!.sittingOutUntilNextHand = true;

    await dealer.applyRebuy("u1", 3000);

    expect(p1!.status).toBe("ACTIVE");
    expect(p1!.sittingOutUntilNextHand).toBe(false);
    // Rebuy with 2+ players in WAITING auto-starts next hand (blinds posted)
    expect(state.street).toBe("PREFLOP");
    expect(state.handId).toBeDefined();
    expect(p1!.stackCents).toBeLessThanOrEqual(3000);
    expect(p1!.stackCents).toBeGreaterThanOrEqual(2900); // 3000 - SB or BB
  });

  it("adds chips to seated player who is ABANDONED and sets ACTIVE when WAITING", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy_abandoned";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    const p1 = state.playersById.get("u1");
    state.street = "WAITING";
    p1!.stackCents = 0;
    p1!.status = "ABANDONED";
    p1!.sittingOutUntilNextHand = true;

    await dealer.applyRebuy("u1", 5000);

    expect(p1!.status).toBe("ACTIVE");
    expect(p1!.sittingOutUntilNextHand).toBe(false);
    expect(state.street).toBe("PREFLOP");
    expect(p1!.stackCents).toBeLessThanOrEqual(5000);
    expect(p1!.stackCents).toBeGreaterThanOrEqual(4900);
  });

  it("adds chips on top of existing stack", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy_topup";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    const p1 = state.playersById.get("u1");
    p1!.stackCents = 500;

    await dealer.applyRebuy("u1", 3000);

    // Rebuy adds 3000 then next hand starts (blinds posted)
    expect(p1!.stackCents).toBeGreaterThanOrEqual(3400); // 3500 - 100 at most
    expect(p1!.stackCents).toBeLessThanOrEqual(3500);
  });

  it("does nothing when userId is not seated", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy_missing";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);

    await dealer.applyRebuy("not_seated", 3000);

    expect(state.playersById.has("not_seated")).toBe(false);
    expect(state.playersById.get("u1")!.stackCents).toBe(5000);
  });

  it("throws when amountCents is below minBuyInCents", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy_invalid";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    const p1 = state.playersById.get("u1");
    p1!.stackCents = 0;
    p1!.status = "OUT";

    await expect(dealer.applyRebuy("u1", 1000)).rejects.toThrow(/INVALID_BUYIN|buyInCents must be >= 2000/);
    expect(p1!.stackCents).toBe(0);
  });

  it("throws when amountCents is above maxBuyInCents", async () => {
    const state = new PokerState();
    state.tableId = "table_rebuy_max";
    state.maxSeats = 6;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    const p1 = state.playersById.get("u1");
    p1!.stackCents = 0;
    p1!.status = "OUT";

    await expect(dealer.applyRebuy("u1", 25000)).rejects.toThrow(/INVALID_BUYIN|must be <= 20000/);
    expect(p1!.stackCents).toBe(0);
  });
});
