import { describe, expect, it } from "vitest";
import { buildWagerActionPayload, resolvePrimaryWagerAction } from "@/components/domain/table/actionBar.logic";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";

function makeOptions(input: Partial<HeroActionOptions>): HeroActionOptions {
  return {
    canFold: true,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    canAllIn: true,
    primaryWagerAction: "NONE",
    callAmount: 0,
    ...input,
  };
}

describe("action bar wager routing", () => {
  it("routes wager submit to BET when primaryWagerAction=BET", () => {
    const options = makeOptions({ canBet: true, primaryWagerAction: "BET" });
    expect(resolvePrimaryWagerAction(options)).toBe("BET");
    expect(buildWagerActionPayload(options, 350)).toEqual({ type: "BET", amount: 350 });
  });

  it("routes wager submit to RAISE when primaryWagerAction=RAISE", () => {
    const options = makeOptions({ canRaise: true, primaryWagerAction: "RAISE" });
    expect(resolvePrimaryWagerAction(options)).toBe("RAISE");
    expect(buildWagerActionPayload(options, 900)).toEqual({ type: "RAISE", amount: 900 });
  });

  it("does not dispatch wager when primaryWagerAction=NONE even if canBet/canRaise flags are inconsistent", () => {
    const options = makeOptions({ canBet: true, canRaise: true, primaryWagerAction: "NONE" });
    expect(resolvePrimaryWagerAction(options)).toBeUndefined();
    expect(buildWagerActionPayload(options, 500)).toBeUndefined();
  });
});

