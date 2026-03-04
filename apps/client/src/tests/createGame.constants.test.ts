import { describe, expect, it } from "vitest";
import {
  BLINDS_OPTIONS,
  MIN_BB,
  MAX_BB,
  getBuyInOptions,
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

  describe("getBuyInOptions", () => {
    it("returns 20, 50, 100 BB options for any big blind", () => {
      const options = getBuyInOptions(200);
      expect(options.map((o) => o.minBuyInCents)).toEqual([4000, 10000, 20000]);
    });

    it("returns empty array when bigBlindCents <= 0", () => {
      expect(getBuyInOptions(0)).toEqual([]);
      expect(getBuyInOptions(-1)).toEqual([]);
    });

    it("labels include dollar amount and BB count", () => {
      const options = getBuyInOptions(200);
      expect(options[0].label).toMatch(/\$40.*20 BB/);
      expect(options[2].label).toMatch(/\$200.*100 BB/);
    });

    it("every option is >= 20 BB and <= 100 BB", () => {
      for (const blind of BLINDS_OPTIONS) {
        const options = getBuyInOptions(blind.bigBlindCents);
        const minCents = blind.bigBlindCents * MIN_BB;
        const maxCents = getMaxBuyInCents(blind.bigBlindCents);
        for (const o of options) {
          expect(o.minBuyInCents).toBeGreaterThanOrEqual(minCents);
          expect(o.minBuyInCents).toBeLessThanOrEqual(maxCents);
        }
      }
    });
  });

  describe("getDefaultMinBuyInCents", () => {
    it("returns 100 BB (max buy-in)", () => {
      expect(getDefaultMinBuyInCents(20)).toBe(2000);
      expect(getDefaultMinBuyInCents(200)).toBe(20000);
    });

    it("returned default equals max buy-in", () => {
      for (const blind of BLINDS_OPTIONS) {
        const defaultMin = getDefaultMinBuyInCents(blind.bigBlindCents);
        const maxCents = getMaxBuyInCents(blind.bigBlindCents);
        expect(defaultMin).toBe(maxCents);
      }
    });
  });
});
