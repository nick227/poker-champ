import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import { clampToLegalAction, getLegalActions } from "./decision.js";

function makeOptions(overrides: Partial<HeroActionOptions> = {}): HeroActionOptions {
  return {
    canFold: true,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    canAllIn: false,
    primaryWagerAction: "NONE",
    callAmount: 0,
    ...overrides,
  };
}

describe("bot decision utils", () => {
  it("returns legal actions including wager bounds", () => {
    const actions = getLegalActions(
      makeOptions({
        canCheck: true,
        canBet: true,
        minRaiseTo: 300,
        maxRaiseTo: 900,
      }),
    );

    expect(actions).toEqual([
      { action: "FOLD" },
      { action: "CHECK" },
      { action: "BET", minAmountCents: 300, maxAmountCents: 900 },
    ]);
  });

  it("clamps out-of-range wager amounts", () => {
    const clamped = clampToLegalAction(
      { action: "RAISE", amountCents: 50_000 },
      makeOptions({ canRaise: true, minRaiseTo: 400, maxRaiseTo: 1_200 }),
    );

    expect(clamped.clamped).toBe(true);
    expect(clamped.payload).toEqual({ action: "RAISE", amountCents: 1_200 });
  });

  it("removes unexpected amount from non-wager actions", () => {
    const clamped = clampToLegalAction({ action: "CHECK", amountCents: 123 }, makeOptions({ canCheck: true }));
    expect(clamped.clamped).toBe(true);
    expect(clamped.payload).toEqual({ action: "CHECK" });
  });

  it("falls back from illegal action preferring CHECK then FOLD", () => {
    const toCheck = clampToLegalAction({ action: "RAISE", amountCents: 900 }, makeOptions({ canCheck: true }));
    expect(toCheck.payload).toEqual({ action: "CHECK" });

    const toFold = clampToLegalAction({ action: "RAISE", amountCents: 900 }, makeOptions({ canFold: true, canCheck: false }));
    expect(toFold.payload).toEqual({ action: "FOLD" });
  });
});
