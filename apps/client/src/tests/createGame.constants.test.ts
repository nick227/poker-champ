import { describe, expect, it } from "vitest";
import {
  BLINDS_OPTIONS,
  MIN_BB,
  getValidMinBuyInOptions,
  getDefaultMinBuyInCents,
  getMaxBuyInCents,
} from "@/components/domain/lobby/createGame.constants";

describe("createGame.constants", () => {
  describe("getMaxBuyInCents", () => {
    it("returns 100 BB in cents", () => {
      expect(getMaxBuyInCents(20)).toBe(2000);
      expect(getMaxBuyInCents(100)).toBe(10000);
      expect(getMaxBuyInCents(1000)).toBe(100000);
    });
  });

  describe("getValidMinBuyInOptions", () => {
    it("for $0.10/$0.20 blinds returns only options <= max buy-in ($20)", () => {
      const options = getValidMinBuyInOptions(20);
      expect(getMaxBuyInCents(20)).toBe(2000);
      expect(options.map((o) => o.minBuyInCents)).toEqual([500, 1000, 2000]);
    });

    it("for $1/$2 blinds returns options between 20 BB and 100 BB", () => {
      const options = getValidMinBuyInOptions(200);
      expect(getMaxBuyInCents(200)).toBe(20000);
      expect(options.map((o) => o.minBuyInCents)).toEqual([5000, 10000, 20000]);
    });

    it("every valid option is >= 20 BB and <= 100 BB", () => {
      for (const blind of BLINDS_OPTIONS) {
        const { bigBlindCents } = blind;
        const options = getValidMinBuyInOptions(bigBlindCents);
        const minCents = bigBlindCents * MIN_BB;
        const maxCents = getMaxBuyInCents(bigBlindCents);
        for (const o of options) {
          expect(o.minBuyInCents).toBeGreaterThanOrEqual(minCents);
          expect(o.minBuyInCents).toBeLessThanOrEqual(maxCents);
        }
      }
    });
  });

  describe("getDefaultMinBuyInCents", () => {
    it("for $0.10/$0.20 returns first valid option (20 BB = $4, so $5)", () => {
      expect(getDefaultMinBuyInCents(20)).toBe(500);
    });

    it("returned default is always <= max buy-in", () => {
      for (const blind of BLINDS_OPTIONS) {
        const defaultMin = getDefaultMinBuyInCents(blind.bigBlindCents);
        const maxCents = getMaxBuyInCents(blind.bigBlindCents);
        expect(defaultMin).toBeLessThanOrEqual(maxCents);
      }
    });
  });
});
