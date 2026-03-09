import { describe, expect, it } from "vitest";
import { PokerState } from "./PokerState.js";
import { PlayerState } from "./PlayerState.js";
import { assertBettingState } from "../engine/invariants/assertBettingState.js";

function makePlayer(id: string, seat: number, stackCents = 5000): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = stackCents;
  p.roundBetCents = 100;
  p.committedCents = 100;
  p.needsAction = false;
  p.connected = true;
  return p;
}

function makeOpenPreflopState(): PokerState {
  const state = new PokerState();
  state.tableId = "table_invariants";
  state.street = "PREFLOP";
  state.runoutMode = "NONE";
  state.seats.push("u1", "u2");
  state.toActSeat = 0;
  state.roundCurrentBetCents = 100;
  state.minRaiseCents = 100;
  state.potCents = 200;

  const u1 = makePlayer("u1", 0);
  const u2 = makePlayer("u2", 1);
  u1.needsAction = true;
  u2.needsAction = false;
  state.playersById.set("u1", u1);
  state.playersById.set("u2", u2);
  return state;
}

describe("assertBettingState", () => {
  it("accepts a valid open betting state", () => {
    const state = makeOpenPreflopState();
    expect(() => assertBettingState(state)).not.toThrow();
  });

  it("throws when roundCurrentBetCents does not match max roundBetCents", () => {
    const state = makeOpenPreflopState();
    state.roundCurrentBetCents = 50;
    expect(() => assertBettingState(state)).toThrow(/roundCurrentBetCents/);
  });

  it("throws when open betting has invalid toActSeat player", () => {
    const state = makeOpenPreflopState();
    const toAct = state.playersById.get("u1")!;
    toAct.needsAction = false;
    state.playersById.get("u2")!.needsAction = true;
    expect(() => assertBettingState(state)).toThrow(/toActSeat/);
  });

  it("throws when runout mode has pending needsAction", () => {
    const state = makeOpenPreflopState();
    state.runoutMode = "STAGED";
    state.playersById.get("u2")!.needsAction = true;
    expect(() => assertBettingState(state)).toThrow(/runoutMode=STAGED/);
  });

  it("throws when a player stack is negative", () => {
    const state = makeOpenPreflopState();
    state.playersById.get("u2")!.stackCents = -1;
    expect(() => assertBettingState(state)).toThrow(/negative stack/);
  });
});
