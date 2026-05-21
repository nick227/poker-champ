import { describe, expect, it } from "vitest";
import { computePayoutAmountsByPlace, getPayoutSlots } from "./tournament-payouts.js";

describe("tournament payouts", () => {
  it("uses winner-take-all for 2 players", () => {
    expect(getPayoutSlots(2)).toEqual([{ place: 1, percent: 100 }]);
    const amounts = computePayoutAmountsByPlace(10_000, 2);
    expect(amounts.get(1)).toBe(10_000);
    expect(amounts.size).toBe(1);
  });

  it("uses 70/30 split for 3 players", () => {
    const amounts = computePayoutAmountsByPlace(10_000, 3);
    expect(amounts.get(1)).toBe(7000);
    expect(amounts.get(2)).toBe(3000);
  });

  it("uses 50/30/20 for 6 players with remainder to 1st", () => {
    const amounts = computePayoutAmountsByPlace(10_001, 6);
    expect(amounts.get(1)).toBe(5001);
    expect(amounts.get(2)).toBe(3000);
    expect(amounts.get(3)).toBe(2000);
    expect([...amounts.values()].reduce((s, v) => s + v, 0)).toBe(10_001);
  });
});
