import { describe, expect, it } from "vitest";
import type { Rect } from "../animationTypes";
import {
  buildChipTravelPlan,
  computeChipCount,
  computeChipTravelDurationMs,
  computeChipTravelTotalMs,
  CHIP_TRAVEL_MAX_CHIPS,
  CHIP_TRAVEL_MAX_DURATION_MS,
  CHIP_TRAVEL_MIN_CHIPS,
  CHIP_TRAVEL_MIN_DURATION_MS,
  CHIP_TRAVEL_STAGGER_MS,
} from "../chipTravel";

const heroRect: Rect = { x: 100, y: 500, width: 80, height: 40 };
const boardRect: Rect = { x: 300, y: 200, width: 120, height: 60 };

describe("chipTravel", () => {
  describe("buildChipTravelPlan", () => {
    it("returns undefined when either endpoint is missing", () => {
      expect(
        buildChipTravelPlan({ id: "a", from: undefined, to: boardRect, amountCents: 500 }),
      ).toBeUndefined();
      expect(
        buildChipTravelPlan({ id: "a", from: heroRect, to: undefined, amountCents: 500 }),
      ).toBeUndefined();
    });

    it("returns undefined when a rect hasn't actually been measured (zero size)", () => {
      const unmeasured: Rect = { x: 0, y: 0, width: 0, height: 0 };
      expect(
        buildChipTravelPlan({ id: "a", from: unmeasured, to: boardRect, amountCents: 500 }),
      ).toBeUndefined();
    });

    it("builds a plan with correct from/to coordinates when both endpoints are measured", () => {
      const plan = buildChipTravelPlan({
        id: "payout-1",
        from: boardRect,
        to: heroRect,
        amountCents: 2500,
      });
      expect(plan).toBeDefined();
      expect(plan?.id).toBe("payout-1");
      expect(plan?.from).toEqual(boardRect);
      expect(plan?.to).toEqual(heroRect);
      expect(plan?.amountCents).toBe(2500);
    });
  });

  describe("computeChipTravelDurationMs", () => {
    it("clamps to the minimum for very short distances", () => {
      const close: Rect = { x: 100, y: 100, width: 10, height: 10 };
      const alsoClose: Rect = { x: 101, y: 101, width: 10, height: 10 };
      expect(computeChipTravelDurationMs(close, alsoClose)).toBe(CHIP_TRAVEL_MIN_DURATION_MS);
    });

    it("clamps to the maximum for very long distances", () => {
      const far: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const alsoFar: Rect = { x: 5000, y: 5000, width: 10, height: 10 };
      expect(computeChipTravelDurationMs(far, alsoFar)).toBe(CHIP_TRAVEL_MAX_DURATION_MS);
    });

    it("scales monotonically with distance between the clamps", () => {
      const origin: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const near: Rect = { x: 300, y: 0, width: 10, height: 10 };
      const far: Rect = { x: 600, y: 0, width: 10, height: 10 };
      const nearMs = computeChipTravelDurationMs(origin, near);
      const farMs = computeChipTravelDurationMs(origin, far);
      expect(farMs).toBeGreaterThan(nearMs);
    });
  });

  describe("computeChipCount", () => {
    it("returns the minimum for zero, negative, or non-finite amounts", () => {
      expect(computeChipCount(0)).toBe(CHIP_TRAVEL_MIN_CHIPS);
      expect(computeChipCount(-100)).toBe(CHIP_TRAVEL_MIN_CHIPS);
      expect(computeChipCount(NaN)).toBe(CHIP_TRAVEL_MIN_CHIPS);
    });

    it("increases with amount and stays within [min, max]", () => {
      const small = computeChipCount(100);
      const large = computeChipCount(500_000);
      expect(small).toBeGreaterThanOrEqual(CHIP_TRAVEL_MIN_CHIPS);
      expect(large).toBeLessThanOrEqual(CHIP_TRAVEL_MAX_CHIPS);
      expect(large).toBeGreaterThanOrEqual(small);
    });
  });

  describe("computeChipTravelTotalMs", () => {
    it("accounts for stagger across the whole stack", () => {
      const total = computeChipTravelTotalMs({ chipCount: 4, durationMs: 300 });
      expect(total).toBe(3 * CHIP_TRAVEL_STAGGER_MS + 300);
    });

    it("equals durationMs alone for a single chip", () => {
      expect(computeChipTravelTotalMs({ chipCount: 1, durationMs: 400 })).toBe(400);
    });
  });
});
