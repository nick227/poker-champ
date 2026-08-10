import { describe, expect, it } from "vitest";
import {
  computeHumanPayoutAmountsByUserId,
  computePayoutAmountsByPlace,
  getPayoutSlots,
} from "./tournament-payouts.js";

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

  it("pays humans by human finish order when bots place higher", () => {
    const payouts = computeHumanPayoutAmountsByUserId(10_000, 3, [
      { userId: "human_winner", finishPlace: 2 },
      { userId: "human_second", finishPlace: 3 },
    ]);
    expect(payouts.get("human_winner")).toBe(7000);
    expect(payouts.get("human_second")).toBe(3000);
    expect(payouts.has("bot_winner")).toBe(false);
  });

  it("does not pay money for a single-human bot challenge", () => {
    const payouts = computeHumanPayoutAmountsByUserId(5000, 1, [
      { userId: "human_only", finishPlace: 2 },
    ]);
    expect(payouts.size).toBe(0);
  });

  it("scales paid places with field size (MTT proposal ITM tiers) at each tier boundary", () => {
    expect(getPayoutSlots(4)).toHaveLength(2); // 3-5 -> 2 (not 3, the one below-multi-table change)
    expect(getPayoutSlots(5)).toHaveLength(2);
    expect(getPayoutSlots(6)).toHaveLength(3); // 6-9 -> 3, unchanged historical default
    expect(getPayoutSlots(9)).toHaveLength(3);
    expect(getPayoutSlots(10)).toHaveLength(4);
    expect(getPayoutSlots(19)).toHaveLength(4);
    expect(getPayoutSlots(20)).toHaveLength(6);
    expect(getPayoutSlots(39)).toHaveLength(6);
    expect(getPayoutSlots(40)).toHaveLength(9);
    expect(getPayoutSlots(79)).toHaveLength(9);
    expect(getPayoutSlots(80)).toHaveLength(14);
    expect(getPayoutSlots(143)).toHaveLength(14);
    expect(getPayoutSlots(144)).toHaveLength(18);
    expect(getPayoutSlots(180)).toHaveLength(18);
  });

  it("every payout tier's percentages sum to 100 and decrease monotonically by place", () => {
    for (const entrantCount of [2, 4, 6, 10, 20, 40, 80, 144]) {
      const slots = getPayoutSlots(entrantCount);
      const total = slots.reduce((sum, s) => sum + s.percent, 0);
      expect(total).toBeCloseTo(100, 5);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i]!.percent).toBeLessThanOrEqual(slots[i - 1]!.percent);
      }
    }
  });

  it("distributes a full prize pool with no leftover cents for a deep (14-place) field", () => {
    const amounts = computePayoutAmountsByPlace(1_000_000, 100);
    expect(amounts.size).toBe(14);
    expect([...amounts.values()].reduce((sum, v) => sum + v, 0)).toBe(1_000_000);
    expect(amounts.get(1)).toBeGreaterThan(amounts.get(14)!);
  });

  it("normalizes unpaid payout slots across payable humans", () => {
    const payouts = computeHumanPayoutAmountsByUserId(10_000, 6, [
      { userId: "human_winner", finishPlace: 1 },
      { userId: "human_runner_up", finishPlace: 2 },
    ]);

    expect(payouts.get("human_winner")).toBe(6250);
    expect(payouts.get("human_runner_up")).toBe(3750);
    expect([...payouts.values()].reduce((sum, amount) => sum + amount, 0)).toBe(10_000);
  });
});
