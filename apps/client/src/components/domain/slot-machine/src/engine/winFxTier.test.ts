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
  it("gives small wins a hard glow blast with some particles", () => {
    const small = scaleWinFx(2);
    expect(small.mode).toBe("glow");
    expect(small.coinCount).toBeGreaterThan(0);
    expect(small.peak).toBeGreaterThanOrEqual(0.65);
    expect(small.holdMs).toBeGreaterThanOrEqual(900);
  });

  it("uses multi-second screen showers for real wins", () => {
    const big = scaleWinFx(12);
    expect(big.mode).toBe("shower");
    expect(big.coinCount).toBeGreaterThan(40);
    expect(big.holdMs).toBeGreaterThanOrEqual(3400);
  });

  it("goes pandemonium on jackpot", () => {
    const jp = scaleWinFx(300, true);
    expect(jp.mode).toBe("pandemonium");
    expect(jp.coinCount).toBeGreaterThanOrEqual(120);
    expect(jp.holdMs).toBeGreaterThanOrEqual(8000);
  });
});
