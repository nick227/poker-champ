import { describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(id: string, seat: number): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = 5000;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = true;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

describe("dealer hand-history persistence ordering", () => {
  it("keeps runtime state unchanged when action persistence fails and uses monotonic actionIndex for accepted actions", async () => {
    const state = new PokerState();
    state.tableId = "table_test_hist_1";
    state.maxSeats = 2;
    state.seats.push("u1", "u2");
    state.handId = "hand_test_hist_1";
    state.street = "PREFLOP";
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;

    const p1 = makePlayer("u1", 0);
    const p2 = makePlayer("u2", 1);
    state.playersById.set("u1", p1);
    state.playersById.set("u2", p2);

    const recordAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("recordAction failed"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const persistence = {
      enabled: true,
      handHistory: {
        recordAction,
      },
      debitBet: vi.fn(),
      postBlind: vi.fn(),
      creditPayout: vi.fn(),
      assertHandBalanced: vi.fn(),
    } as any;

    const dealer = new Dealer(state, persistence);

    await expect(dealer.handleAction("u1", { action: "CHECK" })).rejects.toThrow("recordAction failed");

    // recordAction failure must leave runtime action state unchanged.
    expect(state.toActSeat).toBe(0);
    expect(p1.needsAction).toBe(true);
    expect(p1.status).toBe("ACTIVE");
    expect(recordAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        handId: "hand_test_hist_1",
        playerId: "u1",
        action: "CHECK",
        actionIndex: 1,
      }),
    );

    // Dealer action queue remains rejected after a failed action; reset to test retry behavior.
    (dealer as any).actionQueue = Promise.resolve();

    // Retry succeeds and should use actionIndex=1 for first accepted action.
    await dealer.handleAction("u1", { action: "CHECK" });
    expect(recordAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        playerId: "u1",
        actionIndex: 1,
      }),
    );
    expect(p1.needsAction).toBe(false);
    expect(state.toActSeat).toBe(1);

    // Simulate next turn explicitly to avoid full street progression setup in this focused test.
    state.toActSeat = 0;
    p1.needsAction = true;

    // Next accepted action must increment actionIndex to 2.
    await dealer.handleAction("u1", { action: "CHECK" });
    expect(recordAction).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        playerId: "u1",
        actionIndex: 2,
      }),
    );
  });

  it("persists payout before winner stack settlement on all-folded finish", async () => {
    const state = new PokerState();
    state.tableId = "table_test_hist_2";
    state.maxSeats = 2;
    state.seats.push("u1", "u2");
    state.handId = "hand_test_hist_2";
    state.street = "PREFLOP";
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 300;

    const p1 = makePlayer("u1", 0);
    const p2 = makePlayer("u2", 1);
    p1.stackCents = 4000;
    p2.stackCents = 5000;
    state.playersById.set("u1", p1);
    state.playersById.set("u2", p2);

    let payoutSawPreSettlementStack = false;

    const recordAction = vi.fn().mockResolvedValue(undefined);
    const recordPayout = vi.fn().mockImplementation(async () => {
      payoutSawPreSettlementStack = p2.stackCents === 5000;
    });
    const endHand = vi.fn().mockResolvedValue(undefined);
    const startHand = vi.fn().mockResolvedValue(undefined);

    const persistence = {
      enabled: true,
      handHistory: {
        startHand,
        recordAction,
        recordPayout,
        endHand,
      },
      debitBet: vi.fn(),
      postBlind: vi.fn(),
      creditPayout: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => {
        return args.currentBalance + args.amountCents;
      }),
      assertHandBalanced: vi.fn(),
    } as any;

    const dealer = new Dealer(state, persistence);

    await dealer.handleAction("u1", { action: "FOLD" });

    expect(recordPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        handId: "hand_test_hist_2",
        playerId: "u2",
        payoutIndex: 1,
        amountCents: 300,
      }),
    );
    expect(payoutSawPreSettlementStack).toBe(true);
    expect(p2.stackCents).toBe(5300);
    expect(endHand).toHaveBeenCalledWith(
      expect.objectContaining({
        handId: "hand_test_hist_2",
        reason: "ALL_FOLDED",
      }),
    );
  });

  it("resets payoutIndex on next hand start", async () => {
    const state = new PokerState();
    state.tableId = "table_test_hist_3";
    state.maxSeats = 2;
    state.seats.push("u1", "u2");
    state.street = "WAITING";

    const p1 = makePlayer("u1", 0);
    const p2 = makePlayer("u2", 1);
    state.playersById.set("u1", p1);
    state.playersById.set("u2", p2);

    const recordPayout = vi.fn().mockResolvedValue(undefined);
    const startHandPersist = vi.fn().mockResolvedValue(undefined);

    const persistence = {
      enabled: true,
      handHistory: {
        startHand: startHandPersist,
        recordPayout,
      },
      postBlind: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => {
        return args.currentBalance - args.amountCents;
      }),
      debitBet: vi.fn(),
      creditPayout: vi.fn(),
      assertHandBalanced: vi.fn(),
    } as any;

    const dealer = new Dealer(state, persistence);

    await (dealer as any).startHand();
    const hand1 = state.handId;
    await (dealer as any).recordAcceptedPayout("u1", 100);
    expect(recordPayout).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        handId: hand1,
        payoutIndex: 1,
      }),
    );

    await (dealer as any).startHand();
    const hand2 = state.handId;
    await (dealer as any).recordAcceptedPayout("u1", 120);
    expect(hand2).not.toBe(hand1);
    expect(recordPayout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        handId: hand2,
        payoutIndex: 1,
      }),
    );
  });
});
