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
