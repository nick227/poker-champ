import { describe, it, expect } from "vitest";
import { evaluateHandAwards } from "../awards/evaluateHandAwards.js";
import type { HandSummary, HandAwardSessionState } from "../awards/evaluateHandAwards.js";

function handSummary(overrides: Partial<HandSummary> = {}): HandSummary {
  return {
    handId: "hand_1",
    reason: "SHOWDOWN",
    potCents: 5000,
    bigBlindCents: 100,
    payoutsByUserId: {},
    allInPlayerIds: [],
    ...overrides,
  };
}

function sessionState(overrides: Partial<HandAwardSessionState> = {}): HandAwardSessionState {
  return {
    sessionId: "table_1",
    sessionHands: 0,
    consecutiveWins: 0,
    ...overrides,
  };
}

describe("evaluateHandAwards", () => {
  it("grants first_hand_played when not yet earned", () => {
    const earned = new Set<string>();
    const out = evaluateHandAwards(
      handSummary(),
      "u1",
      sessionState(),
      earned,
      1
    );
    const ids = out.map((c) => c.awardId);
    expect(ids).toContain("first_hand_played");
    expect(out.every((c) => c.contextType === "HAND" && c.contextId === "hand_1")).toBe(true);
  });

  it("does not grant first_hand_played when already earned", () => {
    const out = evaluateHandAwards(
      handSummary(),
      "u1",
      sessionState(),
      new Set(["first_hand_played"]),
      5
    );
    expect(out.map((c) => c.awardId)).not.toContain("first_hand_played");
  });

  it("grants first_win when user won and not yet earned", () => {
    const out = evaluateHandAwards(
      handSummary({ payoutsByUserId: { u1: 5000 } }),
      "u1",
      sessionState(),
      new Set(),
      1
    );
    expect(out.map((c) => c.awardId)).toContain("first_win");
  });

  it("grants session milestone hands_10 with session-scoped triggerKey", () => {
    const out = evaluateHandAwards(
      handSummary(),
      "u1",
      sessionState({ sessionHands: 10 }),
      new Set(),
      10
    );
    const hands10 = out.find((c) => c.awardId === "hands_10");
    expect(hands10).toBeDefined();
    expect(hands10?.triggerKey).toBe("session_table_1_10");
  });

  it("grants lifetime milestone hands_100_life when threshold met and not earned", () => {
    const out = evaluateHandAwards(
      handSummary(),
      "u1",
      sessionState(),
      new Set(),
      100
    );
    expect(out.map((c) => c.awardId)).toContain("hands_100_life");
  });

  it("grants win_streak_2 when won and consecutiveWins >= 2", () => {
    const out = evaluateHandAwards(
      handSummary({ payoutsByUserId: { u1: 100 } }),
      "u1",
      sessionState({ consecutiveWins: 2 }),
      new Set(),
      5
    );
    const streak = out.find((c) => c.awardId === "win_streak_2");
    expect(streak).toBeDefined();
    expect(streak?.triggerKey).toBe("hand_1");
  });

  it("grants showdown_win when won and reason SHOWDOWN", () => {
    const out = evaluateHandAwards(
      handSummary({ reason: "SHOWDOWN", payoutsByUserId: { u1: 200 } }),
      "u1",
      sessionState(),
      new Set(),
      1
    );
    expect(out.map((c) => c.awardId)).toContain("showdown_win");
  });

  it("grants all_in_win when won and was all-in", () => {
    const out = evaluateHandAwards(
      handSummary({ payoutsByUserId: { u1: 300 }, allInPlayerIds: ["u1"] }),
      "u1",
      sessionState(),
      new Set(),
      1
    );
    expect(out.map((c) => c.awardId)).toContain("all_in_win");
  });

  it("grants big_pot_win when won and pot >= 50bb", () => {
    const out = evaluateHandAwards(
      handSummary({
        payoutsByUserId: { u1: 5000 },
        potCents: 5000,
        bigBlindCents: 100,
      }),
      "u1",
      sessionState(),
      new Set(),
      1
    );
    expect(out.map((c) => c.awardId)).toContain("big_pot_win");
  });

  it("returns empty when user did not win and already has first_hand_played", () => {
    const out = evaluateHandAwards(
      handSummary({ payoutsByUserId: { u2: 5000 } }),
      "u1",
      sessionState({ sessionHands: 1 }),
      new Set(["first_hand_played"]),
      1
    );
    expect(out.length).toBe(0);
  });
});
