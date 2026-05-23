import { afterEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "../Dealer.js";
import { ActionOptionsService } from "../dealer/turn/ActionOptionsService.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

vi.setConfig({ testTimeout: 30000 });

function makePlayer(id: string, seat: number, stackCents = 5000): PlayerState {
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
  p.needsAction = false;
  p.hasActedThisStreet = false;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

function makePersistence() {
  const recordAction = vi.fn().mockResolvedValue(undefined);
  return {
    enabled: true,
    handHistory: {
      startHand: vi.fn().mockResolvedValue(undefined),
      recordAction,
      recordPayout: vi.fn().mockResolvedValue(undefined),
      endHand: vi.fn().mockResolvedValue(undefined),
    },
    debitBet: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) =>
      args.currentBalance - args.amountCents,
    ),
    postBlind: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) =>
      args.currentBalance - args.amountCents,
    ),
    creditPayout: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) =>
      args.currentBalance + args.amountCents,
    ),
    assertHandBalanced: vi.fn().mockResolvedValue(undefined),
    recordAction,
  } as any;
}

async function startHeadsUpHand(dealerSeat = 1): Promise<{
  dealer: Dealer;
  state: PokerState;
  sbUserId: string;
  bbUserId: string;
  sbSeat: number;
  bbSeat: number;
}> {
  const state = new PokerState();
  state.tableId = "table_bb_option";
  state.maxSeats = 2;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.street = "WAITING";
  state.dealerSeat = dealerSeat;
  state.seats.push("u1", "u2");

  const u1 = makePlayer("u1", 0);
  const u2 = makePlayer("u2", 1);
  state.playersById.set("u1", u1);
  state.playersById.set("u2", u2);

  const dealer = new Dealer(state, makePersistence());
  await (dealer as any).startHand();

  const sbSeat = state.sbSeat;
  const bbSeat = state.bbSeat;
  const sbUserId = String(state.seats[sbSeat]);
  const bbUserId = String(state.seats[bbSeat]);
  return { dealer, state, sbUserId, bbUserId, sbSeat, bbSeat };
}

async function startThreeHandedHand(): Promise<{
  dealer: Dealer;
  state: PokerState;
  bySeat: string[];
}> {
  const state = new PokerState();
  state.tableId = "table_bb_option_3";
  state.maxSeats = 3;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.street = "WAITING";
  state.dealerSeat = 0;
  state.seats.push("u1", "u2", "u3");

  for (let seat = 0; seat < 3; seat++) {
    state.playersById.set(`u${seat + 1}`, makePlayer(`u${seat + 1}`, seat));
  }

  const dealer = new Dealer(state, makePersistence());
  await (dealer as any).startHand();
  const bySeat = state.seats.map((id) => String(id));
  return { dealer, state, bySeat };
}

describe("betting round BB option", () => {
  const actionOptions = new ActionOptionsService();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("theory: HU SB call must leave PREFLOP with BB to act (CHECK/RAISE)", async () => {
    const { dealer, state, sbUserId, bbUserId, bbSeat } = await startHeadsUpHand();

    await dealer.handleAction(sbUserId, { action: "CALL" });

    expect(state.street).toBe("PREFLOP");
    expect(state.toActSeat).toBe(bbSeat);
    const bbOpts = actionOptions.buildHeroActionOptions(state, bbUserId);
    expect(bbOpts?.canCheck).toBe(true);
    expect(bbOpts?.canRaise).toBe(true);
    expect(state.playersById.get(bbUserId)?.hasActedThisStreet).toBe(false);
  });

  it("HU SB call then BB check advances to FLOP", async () => {
    const { dealer, state, sbUserId, bbUserId, bbSeat } = await startHeadsUpHand();

    await dealer.handleAction(sbUserId, { action: "CALL" });
    expect(state.street).toBe("PREFLOP");
    expect(state.toActSeat).toBe(bbSeat);

    await dealer.handleAction(bbUserId, { action: "CHECK" });
    expect(state.street).toBe("FLOP");
  });

  it("multiway limp to BB leaves BB preflop option before flop", async () => {
    const { dealer, state, bySeat } = await startThreeHandedHand();
    const bbSeat = state.bbSeat;
    const bbUserId = bySeat[bbSeat]!;

    while (state.street === "PREFLOP" && state.toActSeat !== bbSeat) {
      const actorId = bySeat[state.toActSeat]!;
      const opts = actionOptions.buildHeroActionOptions(state, actorId);
      if (!opts) break;
      if (opts.canCall) {
        await dealer.handleAction(actorId, { action: "CALL" });
      } else if (opts.canCheck) {
        await dealer.handleAction(actorId, { action: "CHECK" });
      } else {
        throw new Error(`Unexpected preflop options for ${actorId}`);
      }
    }

    expect(state.street).toBe("PREFLOP");
    expect(state.toActSeat).toBe(bbSeat);
    const bbOpts = actionOptions.buildHeroActionOptions(state, bbUserId);
    expect(bbOpts?.canCheck).toBe(true);
    expect(bbOpts?.canRaise).toBe(true);
  });

  it("BB raise after limp reopens action for prior callers", async () => {
    const { dealer, state, sbUserId, bbUserId } = await startHeadsUpHand();

    await dealer.handleAction(sbUserId, { action: "CALL" });
    await dealer.handleAction(bbUserId, { action: "RAISE", amountCents: 300 });

    expect(state.street).toBe("PREFLOP");
    expect(state.toActSeat).not.toBe(state.bbSeat);
    expect(state.playersById.get(sbUserId)?.needsAction).toBe(true);
    expect(state.playersById.get(sbUserId)?.hasActedThisStreet).toBe(false);
  });

  it("everyone folds to BB ends hand without BB acting", async () => {
    const { dealer, state, sbUserId, bbUserId } = await startHeadsUpHand();

    await dealer.handleAction(sbUserId, { action: "FOLD" });

    expect(state.street).toBe("WAITING");
    expect(state.playersById.get(bbUserId)?.hasActedThisStreet).toBe(false);
    expect(state.handId).toBe("");
  });
});
