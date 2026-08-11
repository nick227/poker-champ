import { describe, expect, it } from "vitest";
import { resolveWinFxTier, scaleWinFx, winFxHasPresentation, winFxLabel } from "./winFxTier";

describe("resolveWinFxTier", () => {
  it("maps multipliers to named tiers", () => {
    expect(resolveWinFxTier(false, 2)).toBe("small");
    expect(resolveWinFxTier(false, 10)).toBe("big");
    expect(resolveWinFxTier(false, 40)).toBe("mega");
    expect(resolveWinFxTier(true, 2)).toBe("jackpot");
  });

  it("labels only presentation tiers", () => {
    expect(winFxLabel("small")).toBeNull();
    expect(winFxLabel("big")).toBe("BIG WIN");
    expect(winFxHasPresentation("small")).toBe(false);
    expect(winFxHasPresentation("mega")).toBe(true);
  });
});

describe("scaleWinFx", () => {
  it("gives every win visible coins and duration", () => {
    const small = scaleWinFx(2);
    expect(small.coinCount).toBeGreaterThanOrEqual(5);
    expect(small.holdMs).toBeGreaterThanOrEqual(600);
    expect(small.peak).toBeGreaterThan(0.4);
  });

  it("scales length and amount heavily with multiplier", () => {
    const low = scaleWinFx(2);
    const mid = scaleWinFx(20);
    const high = scaleWinFx(120);
    expect(mid.holdMs).toBeGreaterThan(low.holdMs * 2);
    expect(high.coinCount).toBeGreaterThan(mid.coinCount);
    expect(high.holdMs).toBeGreaterThan(mid.holdMs);
  });
});
