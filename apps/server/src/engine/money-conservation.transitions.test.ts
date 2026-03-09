import { describe, expect, it } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(id: string, seat: number, stackCents: number): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = stackCents;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = true;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

function makePersistence() {
  return {
    enabled: true,
    handHistory: {
      startHand: async () => {},
      recordAction: async () => {},
      recordPayout: async () => {},
      endHand: async () => {},
    },
    debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
    postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
    creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
    creditRefund: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
    assertHandBalanced: async () => {},
  } as any;
}

describe("money conservation transition checks", () => {
  it("ALL_IN zeros stack and increases pot by exact contribution", async () => {
    const state = new PokerState();
    state.tableId = "table_money_allin";
    state.street = "PREFLOP";
    state.handId = "hand_money_allin";
    state.seats.push("u1", "u2");
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 0;

    const u1 = makePlayer("u1", 0, 700);
    const u2 = makePlayer("u2", 1, 1200);
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const dealer = new Dealer(state, makePersistence());
    const potBefore = state.potCents;
    const allInAmount = u1.stackCents;
    await dealer.handleAction("u1", { action: "ALL_IN" });

    expect(u1.stackCents).toBe(0);
    expect(u1.status).toBe("ALL_IN");
    expect(state.potCents - potBefore).toBe(allInAmount);
  });

  it("RAISE amount is interpreted as raise-to, not raise-by", async () => {
    const state = new PokerState();
    state.tableId = "table_money_raise_to";
    state.street = "PREFLOP";
    state.handId = "hand_money_raise_to";
    state.seats.push("u1", "u2");
    state.toActSeat = 1;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 100;

    const u1 = makePlayer("u1", 0, 5000);
    u1.roundBetCents = 100;
    u1.committedCents = 100;
    u1.needsAction = false;
    const u2 = makePlayer("u2", 1, 5000);
    u2.roundBetCents = 0;
    u2.committedCents = 0;
    u2.needsAction = true;
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const dealer = new Dealer(state, makePersistence());
    await dealer.handleAction("u2", { action: "RAISE", amountCents: 300 });

    expect(u2.stackCents).toBe(4700);
    expect(u2.roundBetCents).toBe(300);
    expect(state.potCents).toBe(400);
    expect(state.roundCurrentBetCents).toBe(300);
  });

  it("uncalled bet is returned when everyone else folds", async () => {
    const state = new PokerState();
    state.tableId = "table_money_uncalled";
    state.street = "PREFLOP";
    state.handId = "hand_money_uncalled";
    state.seats.push("u1", "u2");
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 0;

    const u1 = makePlayer("u1", 0, 1000);
    const u2 = makePlayer("u2", 1, 1000);
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const dealer = new Dealer(state, makePersistence());
    (dealer as any).scheduleNextHand = () => {};

    await dealer.handleAction("u1", { action: "BET", amountCents: 400 });
    await dealer.handleAction("u2", { action: "FOLD" });

    const handResult = (dealer as any).lastHandResult as
      | { payoutsByUserId?: Record<string, number> }
      | undefined;

    expect(handResult?.payoutsByUserId).toEqual({ u1: 400 });
    expect(u1.stackCents).toBe(1000);
  });
});

