import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { CashierService } from "./economy/CashierService.js";

describe("Dealer toAct needsAction repair", () => {
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

  it("repairs a WAITING_FOR_ACTION actor whose needsAction was cleared prematurely", async () => {
    const state = new PokerState();
    state.maxSeats = 6;
    state.minBuyInCents = 1000;
    state.maxBuyInCents = 10000;

    const dealer = new Dealer(state);
    await dealer.addPlayer("u1", "A", 5000);
    await dealer.addPlayer("u2", "B", 5000);

    expect(state.roundState).toBe("WAITING_FOR_ACTION");
    expect(state.toActSeat).toBeGreaterThanOrEqual(0);

    const toActId = state.seats[state.toActSeat]!;
    const toActPlayer = state.playersById.get(toActId);
    expect(toActPlayer).toBeTruthy();
    if (!toActPlayer) throw new Error("missing toAct player");

    toActPlayer.needsAction = false;

    (dealer as any).logActionResolvedNextActor();

    expect(toActPlayer.needsAction).toBe(true);
  });
});
