import { describe, expect, it } from "vitest";
import { computeNextStep } from "../computeNextStep.js";
import { getStallReason } from "../getStallReason.js";
import type { EngineQueries } from "../engineQueries.js";
import type { DecisionState } from "../types.js";

function baseState(): DecisionState {
  return {
    tableId: "table_alignment",
    players: [
      {
        id: "human_1",
        seat: 0,
        kind: "HUMAN",
        status: "ACTIVE",
        connected: false,
        needsAction: true,
      },
    ],
    hand: {
      handId: "hand_alignment",
      street: "FLOP",
      toActSeat: 0,
      turnDeadlineMs: 2_000,
    },
  };
}

function queries(overrides: Partial<EngineQueries> = {}): EngineQueries {
  return {
    getToActPlayer: (state) => state.players.find((p) => p.seat === state.hand?.toActSeat),
    startNextHandDue: () => false,
    bettingClosed: () => false,
    showdownRequired: () => false,
    botActionDue: () => false,
    humanTurnExpired: () => false,
    ...overrides,
  };
}

describe("decision/runtime alignment", () => {
  it("returns RUN_BOT_ACTION when automation is due for disconnected human toAct", () => {
    const state = baseState();
    const step = computeNextStep(
      state,
      1_000,
      queries({
        botActionDue: () => true,
      }),
    );
    expect(step).toBe("RUN_BOT_ACTION");
  });

  it("reports BOT_OVERDUE when automation is due for disconnected human toAct", () => {
    const state = baseState();
    const reason = getStallReason(
      state,
      1_000,
      queries({
        botActionDue: () => true,
      }),
    );
    expect(reason).toBe("BOT_OVERDUE");
  });

  it("returns AUTO_ACTION_TIMEOUT for connected human when timeout is due and no bot action is due", () => {
    const state = baseState();
    state.players[0]!.connected = true;
    const step = computeNextStep(
      state,
      3_000,
      queries({
        humanTurnExpired: () => true,
      }),
    );
    expect(step).toBe("AUTO_ACTION_TIMEOUT");
  });

  it("returns ADVANCE_STREET when betting is closed even if toAct is not resolvable", () => {
    const state = baseState();
    state.hand!.toActSeat = 99;
    const step = computeNextStep(
      state,
      1_000,
      queries({
        bettingClosed: () => true,
      }),
    );
    expect(step).toBe("ADVANCE_STREET");
  });
});
