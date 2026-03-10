import { describe, expect, it } from "vitest";
import { computeNextStep } from "../computeNextStep.js";
import { getStallReason } from "../getStallReason.js";
import type { DecisionState } from "../types.js";

function baseState(): DecisionState {
  return {
    tableId: "table_test",
    players: [
      {
        id: "u1",
        seat: 0,
        kind: "HUMAN",
        status: "ACTIVE",
        connected: true,
        needsAction: true,
      },
    ],
    hand: {
      handId: "hand_test",
      street: "PREFLOP",
      toActSeat: 0,
      turnDeadlineMs: Date.now() + 1_000,
    },
  };
}

describe("decision module shape", () => {
  it("computeNextStep is callable as pure function", () => {
    const state = baseState();
    const step = computeNextStep(state, Date.now());
    expect(step === "WAIT_FOR_HUMAN" || step === "NO_OP").toBe(true);
  });

  it("getStallReason is callable as pure function", () => {
    const state = baseState();
    const reason = getStallReason(state, Date.now());
    expect(reason).toBeNull();
  });
});

