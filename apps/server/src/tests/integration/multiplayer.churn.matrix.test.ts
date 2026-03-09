import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "../../engine/Dealer.js";
import { PokerState } from "../../state/PokerState.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { assertStateInvariants } from "../../engine/invariants/assertState.js";
import { ActionOptionsService } from "../../engine/dealer/services/ActionOptionsService.js";
import { getActionableToActSeatFindingFromState, getStateMoneyFindings } from "../../engine/invariants/churnInvariantContract.js";
import { expectDeferredOrRemoved } from "../helpers/churnBoundaryAssertions.js";

function assertChurnStateInvariants(state: PokerState): void {
  const moneyFindings = getStateMoneyFindings(state);
  expect(moneyFindings).toEqual([]);
  const toActFinding = getActionableToActSeatFindingFromState(state);
  expect(toActFinding).toBeNull();
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function settleHandToWaiting(dealer: Dealer, state: PokerState, maxActions = 64): Promise<void> {
  const optionsService = new ActionOptionsService();
  for (let guard = 0; guard < maxActions && state.street !== "WAITING"; guard += 1) {
    const userId = state.seats[state.toActSeat];
    if (!userId) break;
    const options = optionsService.buildHeroActionOptions(state, userId);
    if (options?.canCheck) await dealer.handleAction(userId, { action: "CHECK" });
    else if (options?.canCall) await dealer.handleAction(userId, { action: "CALL" });
    else if (options?.canFold) await dealer.handleAction(userId, { action: "FOLD" });
    else if (options?.canAllIn) await dealer.handleAction(userId, { action: "ALL_IN" });
    else break;
  }
  expect(state.street).toBe("WAITING");
}

async function createDealerWithPlayers(count: number): Promise<{ dealer: Dealer; state: PokerState }> {
  const state = new PokerState();
  state.tableId = "table_churn_matrix";
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.minBuyInCents = 2000;
  state.maxBuyInCents = 20000;

  const dealer = new Dealer(state);
  (dealer as any).scheduleNextHand = () => {};

  for (let i = 0; i < count; i += 1) {
    const id = `u${i + 1}`;
    await dealer.addPlayer(id, id, 5000);
  }

  return { dealer, state };
}

describe("multiplayer churn matrix", () => {
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

  it("CHURN-A01: human joining mid-hand is dealt in on next hand, not current hand", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);
    const currentHandId = state.handId;

    await dealer.addPlayer("u3", "u3", 5000);
    const newcomer = state.playersById.get("u3");
    expect(newcomer?.status).toBe("ABANDONED");
    expect(newcomer?.sittingOutUntilNextHand).toBe(true);

    await settleHandToWaiting(dealer, state);
    await dealer.forceAdvanceToNextHandForTest();

    const newcomerAfter = state.playersById.get("u3");
    expect(state.handId).not.toBe(currentHandId);
    expect(newcomerAfter?.status).toBe("ACTIVE");
    expect(newcomerAfter?.sittingOutUntilNextHand).toBe(false);

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("CHURN-A02: bot joining mid-hand is dealt in on next hand, not current hand", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);
    const currentHandId = state.handId;

    await dealer.addBot("bot_1", "bot_1", 5000, "chaos_carl");
    const bot = state.playersById.get("bot_1");
    expect(bot?.status).toBe("ABANDONED");
    expect(bot?.sittingOutUntilNextHand).toBe(true);

    await settleHandToWaiting(dealer, state);
    await dealer.forceAdvanceToNextHandForTest();

    const botAfter = state.playersById.get("bot_1");
    expect(state.handId).not.toBe(currentHandId);
    expect(botAfter?.status).toBe("ACTIVE");
    expect(botAfter?.sittingOutUntilNextHand).toBe(false);

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("CHURN-A03: ABANDONED player reconnects mid-hand but stays out of current hand", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);

    const abandoned = state.playersById.get("u1");
    const other = state.playersById.get("u2");
    expect(abandoned).toBeTruthy();
    expect(other).toBeTruthy();
    if (!abandoned || !other) throw new Error("missing players");

    state.street = "TURN";
    state.runoutMode = "NONE";
    state.toActSeat = other.seat;
    state.roundCurrentBetCents = other.roundBetCents;
    abandoned.status = "ABANDONED";
    abandoned.connected = false;
    abandoned.needsAction = false;
    other.status = "ACTIVE";
    other.connected = true;
    other.needsAction = true;

    await dealer.markReconnectedSerialized("u1");

    expect(state.playersById.get("u1")?.connected).toBe(true);
    expect(state.playersById.get("u1")?.status).toBe("ABANDONED");
    expect(state.playersById.get("u1")?.needsAction).toBe(false);

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("CHURN-A04: remove non-acting player mid-hand and remaining players still progress", async () => {
    const { dealer, state } = await createDealerWithPlayers(3);
    const toActUserId = state.seats[state.toActSeat];
    const removeUserId = ["u1", "u2", "u3"].find((id) => id !== toActUserId)!;
    const handIdBefore = state.handId;

    await dealer.removePlayer(removeUserId, { cashOutAfterRemoval: false });
    expectDeferredOrRemoved({ state, userId: removeUserId, handIdBefore });

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("CHURN-A05: disconnected to-act user auto-fold/check does not deadlock hand", async () => {
    const { dealer, state } = await createDealerWithPlayers(2);
    const toActUserId = state.seats[state.toActSeat]!;
    const baselineHandActionSeq = state.handActionSeq;
    const baselineActionCount = state.actionCount;

    await dealer.markDisconnectedSerialized(toActUserId, Date.now() + 60_000);
    await waitFor(
      () =>
        state.street === "WAITING" ||
        state.handActionSeq > baselineHandActionSeq ||
        state.actionCount > baselineActionCount,
      5000,
      "auto action progression",
    );

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("CHURN-A06: repeated disconnect/reconnect churn preserves valid toAct seat", async () => {
    const { dealer, state } = await createDealerWithPlayers(4);

    for (let i = 0; i < 8 && state.street !== "WAITING"; i += 1) {
      const userId = state.seats[state.toActSeat]!;
      assertChurnStateInvariants(state);
      await dealer.markDisconnectedSerialized(userId, Date.now() + 60_000);
      await dealer.markReconnectedSerialized(userId);
      assertChurnStateInvariants(state);
    }

    assertChurnStateInvariants(state);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
