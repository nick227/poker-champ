import { describe, expect, it } from "vitest";
import { noFurtherBettingPossible } from "./BettingRound.js";
import { assertBettingState } from "../invariants/assertBettingState.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  status: PlayerState["status"];
  roundBetCents: number;
  committedCents: number;
  stackCents: number;
  needsAction: boolean;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.name = input.id;
  p.kind = "HUMAN";
  p.seat = input.seat;
  p.status = input.status;
  p.roundBetCents = input.roundBetCents;
  p.committedCents = input.committedCents;
  p.stackCents = input.stackCents;
  p.needsAction = input.needsAction;
  p.connected = true;
  return p;
}

describe("noFurtherBettingPossible short all-in closure", () => {
  it("returns true when all ACTIVE players have no pending action and at least one ALL_IN contender exists", () => {
    const state = new PokerState();
    state.street = "PREFLOP";
    state.roundCurrentBetCents = 5000;
    state.toActSeat = 5;
    state.seats.push("u1", "u2", "u3", "u4", "bot_1", "bot_2");

    state.playersById.set("u1", makePlayer({
      id: "u1",
      seat: 0,
      status: "ACTIVE",
      roundBetCents: 4767,
      committedCents: 4767,
      stackCents: 283,
      needsAction: false,
    }));
    state.playersById.set("u2", makePlayer({
      id: "u2",
      seat: 1,
      status: "ACTIVE",
      roundBetCents: 4767,
      committedCents: 4767,
      stackCents: 183,
      needsAction: false,
    }));
    state.playersById.set("u3", makePlayer({
      id: "u3",
      seat: 2,
      status: "ACTIVE",
      roundBetCents: 4767,
      committedCents: 4767,
      stackCents: 233,
      needsAction: false,
    }));
    state.playersById.set("u4", makePlayer({
      id: "u4",
      seat: 3,
      status: "FOLDED",
      roundBetCents: 50,
      committedCents: 50,
      stackCents: 4950,
      needsAction: false,
    }));
    state.playersById.set("bot_1", makePlayer({
      id: "bot_1",
      seat: 4,
      status: "ALL_IN",
      roundBetCents: 5000,
      committedCents: 5000,
      stackCents: 0,
      needsAction: false,
    }));
    state.playersById.set("bot_2", makePlayer({
      id: "bot_2",
      seat: 5,
      status: "ALL_IN",
      roundBetCents: 5000,
      committedCents: 5000,
      stackCents: 0,
      needsAction: false,
    }));

    expect(noFurtherBettingPossible(state)).toBe(true);
    expect(() => assertBettingState(state)).not.toThrow();
  });
});

