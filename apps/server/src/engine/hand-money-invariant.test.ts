import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { CashierService } from "./economy/CashierService.js";
import { PokerState } from "../state/PokerState.js";

function makeState(tableId: string): PokerState {
  const state = new PokerState();
  state.tableId = tableId;
  state.tableName = tableId;
  state.maxSeats = 6;
  state.minBuyInCents = 1000;
  state.maxBuyInCents = 20000;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.street = "WAITING";
  return state;
}

function sumStacks(state: PokerState): number {
  return [...state.playersById.values()].reduce((sum, player) => sum + player.stackCents, 0);
}

async function finishCurrentHandWithLegalActions(dealer: Dealer, state: PokerState): Promise<void> {
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
      throw new Error("No legal passive action available for to-act player");
    }

    guard += 1;
  }

  expect(state.street).toBe("WAITING");
}

describe("hand money invariant", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockImplementation(async ({ amountCents }) => ({
      success: true,
      newTableBalance: amountCents,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("conserves chips across a full dealer-driven hand lifecycle", async () => {
    const state = makeState("table_hand_money_invariant");
    const dealer = new Dealer(state);

    await dealer.addPlayer("u1", "Alice", 5000);
    await dealer.addPlayer("u2", "Bob", 5000);

    expect(state.street).not.toBe("WAITING");
    const chipMassBefore = sumStacks(state) + state.potCents;

    await finishCurrentHandWithLegalActions(dealer, state);

    // In this engine, chip mass is fully represented in stacks at hand end.
    expect(sumStacks(state)).toBe(chipMassBefore);
    for (const player of state.playersById.values()) {
      expect(player.stackCents).toBeGreaterThanOrEqual(0);
    }
  });
});
