import { describe, expect, it } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = "ACTIVE";
  p.stackCents = input.stackCents;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = true;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

describe("multiway sidepot + uncalled return (action path)", () => {
  it("returns uncontested side amount through real action flow", async () => {
    const state = new PokerState();
    state.tableId = "table_sidepot_uncalled_action_path";
    state.handId = "hand_sidepot_uncalled_action_path";
    state.maxSeats = 3;
    state.seats.push("A", "B", "C");
    state.street = "RIVER";
    state.dealerSeat = 0;
    state.sbSeat = 1;
    state.bbSeat = 2;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.board.push("Qh", "Qd", "7s", "8c", "9d");

    const A = makePlayer({ id: "A", seat: 0, stackCents: 1000 });
    const B = makePlayer({ id: "B", seat: 1, stackCents: 300 });
    const C = makePlayer({ id: "C", seat: 2, stackCents: 300 });
    state.playersById.set("A", A);
    state.playersById.set("B", B);
    state.playersById.set("C", C);

    const paidByUserId = new Map<string, number>();
    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
        paidByUserId.set(args.userId, (paidByUserId.get(args.userId) ?? 0) + args.amountCents);
        return args.currentBalance + args.amountCents;
      },
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence);
    (dealer as any).scheduleNextHand = () => {};
    (dealer as any).holeCardsByPlayerId.set("A", ["2c", "3c"]);
    (dealer as any).holeCardsByPlayerId.set("B", ["Ah", "Ad"]);
    (dealer as any).holeCardsByPlayerId.set("C", ["Kc", "Kd"]);

    await dealer.handleAction("A", { action: "BET", amountCents: 1000 });
    await dealer.handleAction("B", { action: "ALL_IN" });
    await dealer.handleAction("C", { action: "ALL_IN" });

    expect(state.street).toBe("WAITING");
    expect(state.potCents).toBe(1600);

    expect(paidByUserId.get("A") ?? 0).toBe(700);
    expect(paidByUserId.get("B") ?? 0).toBe(900);
    expect(paidByUserId.get("C") ?? 0).toBe(0);
    expect((paidByUserId.get("A") ?? 0) + (paidByUserId.get("B") ?? 0) + (paidByUserId.get("C") ?? 0)).toBe(1600);

    const handResult = (dealer as any).lastHandResult as { payoutsByUserId: Record<string, number>; reason: string } | undefined;
    expect(handResult?.reason).toBe("SHOWDOWN");
    expect(handResult?.payoutsByUserId).toEqual({ A: 700, B: 900 });
  });
});
