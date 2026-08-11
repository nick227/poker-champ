import { describe, expect, it } from "vitest";
import { resolveWinFxTier, winFxHasPresentation, winFxLabel } from "./winFxTier";

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
