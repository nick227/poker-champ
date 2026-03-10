import { describe, expect, it } from "vitest";
import { computeNextStep } from "../computeNextStep.js";
import { getStallReason } from "../getStallReason.js";
import type { EngineQueries } from "../engineQueries.js";
import type { DecisionPlayer, DecisionState } from "../types.js";

class FakeClock {
  private currentMs: number;

  constructor(startMs = 1_000) {
    this.currentMs = startMs;
  }

  now(): number {
    return this.currentMs;
  }

  advance(ms: number): number {
    this.currentMs += ms;
    return this.currentMs;
  }
}

function makePlayer(overrides: Partial<DecisionPlayer>): DecisionPlayer {
  return {
    id: overrides.id ?? "p1",
    seat: overrides.seat ?? 0,
    kind: overrides.kind ?? "HUMAN",
    status: overrides.status ?? "ACTIVE",
    connected: overrides.connected ?? true,
    needsAction: overrides.needsAction ?? true,
    connectionState: overrides.connectionState,
  };
}

function makeState(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    tableId: overrides.tableId ?? "table_phase2_det",
    players: overrides.players ?? [makePlayer({ id: "human_1", seat: 0, kind: "HUMAN", connected: true })],
    hand:
      overrides.hand ??
      {
        handId: "hand_phase2_det",
        street: "PREFLOP",
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

describe("phase2 deterministic decision lifecycle", () => {
  it("1) blind all-in edge yields RUN_SHOWDOWN", () => {
    const clock = new FakeClock(10_000);
    const state = makeState({
      hand: { handId: "h1", street: "PREFLOP", toActSeat: 0, turnDeadlineMs: 10_500 },
      players: [makePlayer({ id: "sb", seat: 0, kind: "HUMAN", connected: true })],
    });
    const step = computeNextStep(
      state,
      clock.now(),
      queries({
        showdownRequired: () => true,
      }),
    );
    expect(step).toBe("RUN_SHOWDOWN");
  });

  it("2) closed betting yields ADVANCE_STREET and STREET_ADVANCE_OVERDUE", () => {
    const clock = new FakeClock(20_000);
    const state = makeState({
      hand: { handId: "h2", street: "FLOP", toActSeat: 0, turnDeadlineMs: 21_000 },
      players: [makePlayer({ id: "h", seat: 0, kind: "HUMAN", connected: true })],
    });
    const q = queries({
      bettingClosed: () => true,
    });
    expect(computeNextStep(state, clock.now(), q)).toBe("ADVANCE_STREET");
    expect(getStallReason(state, clock.now(), q)).toBe("STREET_ADVANCE_OVERDUE");
  });

  it("3) bot due yields RUN_BOT_ACTION and BOT_OVERDUE", () => {
    const clock = new FakeClock(30_000);
    const state = makeState({
      hand: { handId: "h3", street: "TURN", toActSeat: 1, turnDeadlineMs: 30_500 },
      players: [makePlayer({ id: "bot_1", seat: 1, kind: "BOT", connected: true })],
    });
    const q = queries({
      botActionDue: () => true,
    });
    expect(computeNextStep(state, clock.now(), q)).toBe("RUN_BOT_ACTION");
    expect(getStallReason(state, clock.now(), q)).toBe("BOT_OVERDUE");
  });

  it("4) disconnected human automation due yields RUN_BOT_ACTION and BOT_OVERDUE", () => {
    const clock = new FakeClock(40_000);
    const state = makeState({
      hand: { handId: "h4", street: "TURN", toActSeat: 0, turnDeadlineMs: 40_500 },
      players: [makePlayer({ id: "u_disc", seat: 0, kind: "HUMAN", connected: false })],
    });
    const q = queries({
      botActionDue: () => true,
    });
    expect(computeNextStep(state, clock.now(), q)).toBe("RUN_BOT_ACTION");
    expect(getStallReason(state, clock.now(), q)).toBe("BOT_OVERDUE");
  });

  it("5) connected human before deadline yields WAIT_FOR_HUMAN", () => {
    const clock = new FakeClock(50_000);
    const state = makeState({
      hand: { handId: "h5", street: "RIVER", toActSeat: 0, turnDeadlineMs: 55_000 },
      players: [makePlayer({ id: "u_human", seat: 0, kind: "HUMAN", connected: true })],
    });
    const q = queries({
      humanTurnExpired: (_state, now) => now >= 55_000,
    });
    expect(computeNextStep(state, clock.now(), q)).toBe("WAIT_FOR_HUMAN");
    clock.advance(6_000);
    expect(computeNextStep(state, clock.now(), q)).toBe("AUTO_ACTION_TIMEOUT");
    expect(getStallReason(state, clock.now(), q)).toBe("TURN_TIMEOUT_OVERDUE");
  });

  it("6) invalid toAct yields INVALID_TO_ACT stall reason", () => {
    const clock = new FakeClock(60_000);
    const state = makeState({
      hand: { handId: "h6", street: "FLOP", toActSeat: 9, turnDeadlineMs: 60_500 },
      players: [makePlayer({ id: "u_only", seat: 0, kind: "HUMAN", connected: true })],
    });
    expect(computeNextStep(state, clock.now(), queries())).toBe("NO_OP");
    expect(getStallReason(state, clock.now(), queries())).toBe("INVALID_TO_ACT");
  });

  it("7) reconnect before deadline preserves acting seat and deadline", () => {
    const clock = new FakeClock(70_000);
    const deadline = clock.now() + 10_000;
    const state = makeState({
      hand: { handId: "h7", street: "TURN", toActSeat: 1, turnDeadlineMs: deadline },
      players: [
        makePlayer({ id: "u0", seat: 0, kind: "HUMAN", connected: true, needsAction: false }),
        makePlayer({ id: "u1", seat: 1, kind: "HUMAN", connected: false, needsAction: true }),
      ],
    });
    const q = queries({
      botActionDue: (_state, now) => now >= deadline,
      humanTurnExpired: (_state, now) => now >= deadline,
    });

    expect(computeNextStep(state, clock.now(), q)).toBe("NO_OP");

    state.players[1]!.connected = true;

    expect(computeNextStep(state, clock.now(), q)).toBe("WAIT_FOR_HUMAN");
    expect(state.hand?.toActSeat).toBe(1);
    expect(state.hand?.turnDeadlineMs).toBe(deadline);
  });

  it("8) reconnect after deadline does not cancel timeout automation authority", () => {
    const clock = new FakeClock(80_000);
    const deadline = clock.now() - 1;
    const state = makeState({
      hand: { handId: "h8", street: "RIVER", toActSeat: 1, turnDeadlineMs: deadline },
      players: [
        makePlayer({ id: "u0", seat: 0, kind: "HUMAN", connected: true, needsAction: false }),
        makePlayer({ id: "u1", seat: 1, kind: "HUMAN", connected: false, needsAction: true }),
      ],
    });
    const q = queries({
      botActionDue: (_state, now) => now >= deadline,
      humanTurnExpired: (_state, now) => now >= deadline,
    });

    expect(computeNextStep(state, clock.now(), q)).toBe("RUN_BOT_ACTION");

    state.players[1]!.connected = true;

    expect(computeNextStep(state, clock.now(), q)).toBe("RUN_BOT_ACTION");
    expect(state.hand?.toActSeat).toBe(1);
    expect(state.hand?.turnDeadlineMs).toBe(deadline);
  });
});
