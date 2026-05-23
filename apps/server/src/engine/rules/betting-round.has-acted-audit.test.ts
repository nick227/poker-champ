import { describe, expect, it } from "vitest";
import {
  bettingRoundComplete,
  noFurtherBettingPossible,
  onNewBetLevel,
  resetBettingRound,
} from "./BettingRound.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

function seatPlayer(
  state: PokerState,
  input: {
    id: string;
    seat: number;
    status: PlayerState["status"];
    roundBetCents?: number;
    needsAction?: boolean;
    hasActedThisStreet?: boolean;
  },
): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.seat = input.seat;
  p.status = input.status;
  p.roundBetCents = input.roundBetCents ?? 0;
  p.needsAction = input.needsAction ?? false;
  p.hasActedThisStreet = input.hasActedThisStreet ?? false;
  p.stackCents = 1000;
  p.connected = true;
  while (state.seats.length <= input.seat) state.seats.push("");
  state.seats[input.seat] = input.id;
  state.playersById.set(input.id, p);
  return p;
}

describe("hasActedThisStreet audit", () => {
  it("resetBettingRound clears hasActedThisStreet for every player", () => {
    const state = new PokerState();
    state.bigBlindCents = 100;
    const a = seatPlayer(state, { id: "a", seat: 0, status: "ACTIVE", hasActedThisStreet: true });
    const b = seatPlayer(state, { id: "b", seat: 1, status: "FOLDED", hasActedThisStreet: true });
    const c = seatPlayer(state, { id: "c", seat: 2, status: "ALL_IN", hasActedThisStreet: true });

    resetBettingRound(state);

    expect(a.hasActedThisStreet).toBe(false);
    expect(b.hasActedThisStreet).toBe(false);
    expect(c.hasActedThisStreet).toBe(false);
  });

  it("bettingRoundComplete ignores folded and all-in players who have not acted", () => {
    const state = new PokerState();
    state.roundCurrentBetCents = 100;
    seatPlayer(state, {
      id: "active",
      seat: 0,
      status: "ACTIVE",
      roundBetCents: 100,
      hasActedThisStreet: true,
      needsAction: false,
    });
    seatPlayer(state, {
      id: "folded",
      seat: 1,
      status: "FOLDED",
      roundBetCents: 50,
      hasActedThisStreet: false,
      needsAction: false,
    });
    seatPlayer(state, {
      id: "allin",
      seat: 2,
      status: "ALL_IN",
      roundBetCents: 100,
      hasActedThisStreet: false,
      needsAction: false,
    });

    expect(bettingRoundComplete(state)).toBe(true);
  });

  it("bettingRoundComplete is false while an ACTIVE player has not acted", () => {
    const state = new PokerState();
    state.roundCurrentBetCents = 100;
    seatPlayer(state, {
      id: "acted",
      seat: 0,
      status: "ACTIVE",
      roundBetCents: 100,
      hasActedThisStreet: true,
    });
    seatPlayer(state, {
      id: "waiting",
      seat: 1,
      status: "ACTIVE",
      roundBetCents: 100,
      hasActedThisStreet: false,
      needsAction: true,
    });

    expect(bettingRoundComplete(state)).toBe(false);
  });

  it("onNewBetLevel reopens only ACTIVE schedulable non-actors; not folded or all-in", () => {
    const state = new PokerState();
    state.roundCurrentBetCents = 200;
    const raiser = seatPlayer(state, {
      id: "raiser",
      seat: 0,
      status: "ACTIVE",
      roundBetCents: 200,
      hasActedThisStreet: true,
      needsAction: false,
    });
    const caller = seatPlayer(state, {
      id: "caller",
      seat: 1,
      status: "ACTIVE",
      roundBetCents: 100,
      hasActedThisStreet: true,
      needsAction: false,
    });
    const folded = seatPlayer(state, {
      id: "folded",
      seat: 2,
      status: "FOLDED",
      roundBetCents: 100,
      hasActedThisStreet: true,
      needsAction: false,
    });
    const allIn = seatPlayer(state, {
      id: "allin",
      seat: 3,
      status: "ALL_IN",
      roundBetCents: 100,
      hasActedThisStreet: true,
      needsAction: false,
    });

    onNewBetLevel(state, raiser.id);

    expect(raiser.hasActedThisStreet).toBe(true);
    expect(raiser.needsAction).toBe(false);
    expect(caller.hasActedThisStreet).toBe(false);
    expect(caller.needsAction).toBe(true);
    expect(folded.hasActedThisStreet).toBe(true);
    expect(folded.needsAction).toBe(false);
    expect(allIn.hasActedThisStreet).toBe(true);
    expect(allIn.needsAction).toBe(false);
  });
});
