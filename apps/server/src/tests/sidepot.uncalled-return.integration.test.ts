import { describe, expect, it } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  committedCents: number;
  status: PlayerState["status"];
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = input.status;
  p.stackCents = input.stackCents;
  p.roundBetCents = input.committedCents;
  p.committedCents = input.committedCents;
  p.needsAction = false;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

describe("multiway sidepot + uncalled return", () => {
  it("awards uncontested side amount to only eligible contributor while main pot goes to best hand", async () => {
    const state = new PokerState();
    state.tableId = "table_sidepot_uncalled";
    state.handId = "hand_sidepot_uncalled";
    state.street = "SHOWDOWN";
    state.maxSeats = 3;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.seats.push("A", "B", "C");
    state.dealerSeat = 0;

    const A = makePlayer({ id: "A", seat: 0, stackCents: 1000, committedCents: 1000, status: "ACTIVE" });
    const B = makePlayer({ id: "B", seat: 1, stackCents: 0, committedCents: 300, status: "ALL_IN" });
    const C = makePlayer({ id: "C", seat: 2, stackCents: 0, committedCents: 300, status: "ALL_IN" });

    state.playersById.set(A.id, A);
    state.playersById.set(B.id, B);
    state.playersById.set(C.id, C);
    state.potCents = 1600; // 1000 + 300 + 300

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

    // B wins contested 900 main pot (straight), A gets uncontested 700 side pot.
    (dealer as any).holeCardsByPlayerId.set("A", ["Kc", "Qd"]);
    (dealer as any).holeCardsByPlayerId.set("B", ["Ah", "5h"]);
    (dealer as any).holeCardsByPlayerId.set("C", ["7s", "7d"]);
    state.board.push("2h", "3d", "4s", "9c", "Kd");

    await (dealer as any).finishHandShowdownWithSidePots();

    expect(paidByUserId.get("A") ?? 0).toBe(700);
    expect(paidByUserId.get("B") ?? 0).toBe(900);
    expect(paidByUserId.get("C") ?? 0).toBe(0);
    expect((paidByUserId.get("A") ?? 0) + (paidByUserId.get("B") ?? 0) + (paidByUserId.get("C") ?? 0)).toBe(1600);

    expect(A.stackCents).toBe(1700); // 1000 + 700 uncontested side amount
    expect(B.stackCents).toBe(900); // 0 + 900 contested main pot
    expect(C.stackCents).toBe(0);

    const handResult = (dealer as any).lastHandResult as { payoutsByUserId: Record<string, number>; reason: string } | undefined;
    expect(handResult?.reason).toBe("SHOWDOWN");
    expect(handResult?.payoutsByUserId).toEqual({ A: 700, B: 900 });
  });
});
