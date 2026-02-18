import { afterEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { CashierService } from "../engine/economy/CashierService.js";

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
  p.needsAction = true;
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
    debitBet: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents),
    postBlind: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents),
    creditPayout: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents),
    assertHandBalanced: vi.fn().mockResolvedValue(undefined),
    recordAction,
  } as any;
}

describe("dealer rule decisions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("short all-in raise does not reopen action", async () => {
    const state = new PokerState();
    state.tableId = "table_short_allin";
    state.street = "PREFLOP";
    state.handId = "hand_short_allin";
    state.seats.push("u1", "u2", "u3");
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 600;

    const u1 = makePlayer("u1", 0, 150);
    u1.roundBetCents = 100;
    u1.committedCents = 100;
    u1.needsAction = true;

    const u2 = makePlayer("u2", 1, 5000);
    u2.roundBetCents = 200;
    u2.committedCents = 200;
    u2.needsAction = false;

    const u3 = makePlayer("u3", 2, 5000);
    u3.roundBetCents = 200;
    u3.committedCents = 200;
    u3.needsAction = true;

    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);
    state.playersById.set("u3", u3);

    const dealer = new Dealer(state, makePersistence());
    await dealer.handleAction("u1", { action: "ALL_IN" });

    expect(state.roundCurrentBetCents).toBe(250);
    expect(state.minRaiseCents).toBe(100);
    expect(u2.needsAction).toBe(false);
    expect(u3.needsAction).toBe(true);
    expect(u1.status).toBe("ALL_IN");
  });

  it("all-in with legal raise increment reopens action", async () => {
    const state = new PokerState();
    state.tableId = "table_valid_allin";
    state.street = "PREFLOP";
    state.handId = "hand_valid_allin";
    state.seats.push("u1", "u2", "u3");
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 600;

    const u1 = makePlayer("u1", 0, 300);
    u1.roundBetCents = 100;
    u1.committedCents = 100;
    u1.needsAction = true;

    const u2 = makePlayer("u2", 1, 5000);
    u2.roundBetCents = 200;
    u2.committedCents = 200;
    u2.needsAction = false;

    const u3 = makePlayer("u3", 2, 5000);
    u3.roundBetCents = 200;
    u3.committedCents = 200;
    u3.needsAction = false;

    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);
    state.playersById.set("u3", u3);

    const dealer = new Dealer(state, makePersistence());
    await dealer.handleAction("u1", { action: "ALL_IN" });

    expect(state.roundCurrentBetCents).toBe(400);
    expect(state.minRaiseCents).toBe(200);
    expect(u2.needsAction).toBe(true);
    expect(u3.needsAction).toBe(true);
    expect(u1.needsAction).toBe(false);
    expect(u1.status).toBe("ALL_IN");
  });

  it("consented leave in-hand records fold semantics before seat removal", async () => {
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true } as any);

    const state = new PokerState();
    state.tableId = "table_consented_leave";
    state.street = "PREFLOP";
    state.handId = "hand_consented_leave";
    state.seats.push("u1", "u2");
    state.toActSeat = 1;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 200;

    const u1 = makePlayer("u1", 0, 4000);
    const u2 = makePlayer("u2", 1, 4000);
    u1.roundBetCents = 100;
    u2.roundBetCents = 100;
    u1.committedCents = 100;
    u2.committedCents = 100;
    u1.needsAction = true;
    u2.needsAction = true;
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const persistence = makePersistence();
    const dealer = new Dealer(state, persistence);
    const client = { send: vi.fn(), leave: vi.fn() };
    dealer.bindClient("u2", client as any);
    await dealer.handleConsentedLeave("u1");

    expect(persistence.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        handId: "hand_consented_leave",
        playerId: "u1",
        action: "FOLD",
      }),
    );
    const sentSnapshots = (client.send.mock.calls as any[])
      .filter(([type]) => type === "TABLE_SNAPSHOT")
      .map(([, payload]) => payload);
    const forcedFoldSnapshot = sentSnapshots.find(
      (payload: any) =>
        payload?.lastAction?.origin === "FORCED" &&
        payload?.lastAction?.action === "FOLD" &&
        payload?.lastAction?.actorUserId === "u1",
    );
    expect(forcedFoldSnapshot).toBeDefined();
    expect(state.playersById.has("u1")).toBe(false);
  });

  it("heads-up uses button as SB preflop and BB acts first postflop", async () => {
    const state = new PokerState();
    state.tableId = "table_heads_up";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.street = "WAITING";
    state.dealerSeat = 1;
    state.seats.push("u1", "u2");

    const u1 = makePlayer("u1", 0, 5000);
    const u2 = makePlayer("u2", 1, 5000);
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const dealer = new Dealer(state, makePersistence());
    await (dealer as any).startHand();

    const dealerUserId = state.seats[state.dealerSeat];
    expect(dealerUserId).toBeTruthy();
    const sbPlayer = state.playersById.get(String(dealerUserId))!;
    expect(sbPlayer.roundBetCents).toBe(state.smallBlindCents);
    expect(state.toActSeat).toBe(state.dealerSeat);

    await dealer.handleAction(String(dealerUserId), { action: "CALL" });
    const bbSeat = state.seats.findIndex((id) => id && id !== dealerUserId);
    const bbId = state.seats[bbSeat]!;
    await dealer.handleAction(bbId, { action: "CHECK" });

    expect(state.street).toBe("FLOP");
    expect(state.toActSeat).toBe(bbSeat);
  });

  it("ignores duplicate actionId within the same hand", async () => {
    const state = new PokerState();
    state.tableId = "table_action_id";
    state.street = "PREFLOP";
    state.handId = "hand_action_id";
    state.seats.push("u1", "u2");
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;

    const u1 = makePlayer("u1", 0, 5000);
    const u2 = makePlayer("u2", 1, 5000);
    u1.needsAction = true;
    u2.needsAction = true;
    state.playersById.set("u1", u1);
    state.playersById.set("u2", u2);

    const persistence = makePersistence();
    const dealer = new Dealer(state, persistence);

    await dealer.handleAction("u1", { action: "CHECK" }, "4e5968f4-e8ac-4eab-8196-bbb17fe6a351");
    const toActAfterFirst = state.toActSeat;
    const recordActionCallsAfterFirst = persistence.recordAction.mock.calls.length;

    await dealer.handleAction("u1", { action: "CHECK" }, "4e5968f4-e8ac-4eab-8196-bbb17fe6a351");

    expect(state.toActSeat).toBe(toActAfterFirst);
    expect(persistence.recordAction.mock.calls.length).toBe(recordActionCallsAfterFirst);
  });

  it("emits staged runout snapshots in order for preflop all-in heads-up", async () => {
    vi.useFakeTimers();
    try {
      const state = new PokerState();
      state.tableId = "table_runout_order";
      state.maxSeats = 2;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.street = "WAITING";
      state.dealerSeat = 1;
      state.seats.push("u1", "u2");

      const u1 = makePlayer("u1", 0, 5000);
      const u2 = makePlayer("u2", 1, 5000);
      state.playersById.set("u1", u1);
      state.playersById.set("u2", u2);

      const reasons: string[] = [];
      const client = {
        send: (type: string, payload: any) => {
          if (type === "TABLE_SNAPSHOT") reasons.push(String(payload?.reason ?? ""));
        },
      };

      const dealer = new Dealer(state, makePersistence());
      dealer.bindClient("u1", client as any);

      await (dealer as any).startHand();
      reasons.length = 0;

      const firstToAct = state.seats[state.toActSeat]!;
      const secondToAct = firstToAct === "u1" ? "u2" : "u1";

      await dealer.handleAction(firstToAct, { action: "ALL_IN" });
      const completeHandPromise = dealer.handleAction(secondToAct, { action: "CALL" });
      await vi.advanceTimersByTimeAsync(6000);
      await completeHandPromise;

      const runoutReasons = reasons.filter((r) => r === "RUNOUT_STAGE");
      expect(runoutReasons.length).toBe(3);

      const flopIdx = reasons.indexOf("RUNOUT_STAGE");
      const handEndIdx = reasons.indexOf("HAND_END");
      expect(flopIdx).toBeGreaterThanOrEqual(0);
      expect(handEndIdx).toBeGreaterThan(flopIdx);
    } finally {
      vi.useRealTimers();
    }
  });
});
