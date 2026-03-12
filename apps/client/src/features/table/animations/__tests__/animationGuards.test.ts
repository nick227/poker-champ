import { describe, expect, it } from "vitest";
import { shouldRunTableAnimationRequest } from "../animationGuards";

describe("animationGuards", () => {
  describe("shouldRunTableAnimationRequest", () => {
    it("allows POT_WIN when payload.isHero is true", () => {
      expect(
        shouldRunTableAnimationRequest({
          event: "POT_WIN",
          tier: 1,
          payload: { isHero: true },
        })
      ).toBe(true);
    });

    it("rejects POT_WIN when payload.isHero is false", () => {
      expect(
        shouldRunTableAnimationRequest({
          event: "POT_WIN",
          tier: 1,
          payload: { isHero: false },
        })
      ).toBe(false);
    });

    it("rejects POT_WIN when payload is missing isHero", () => {
      expect(
        shouldRunTableAnimationRequest({
          event: "POT_WIN",
          tier: 1,
          payload: {},
        })
      ).toBe(false);
      expect(
        shouldRunTableAnimationRequest({
          event: "POT_WIN",
          tier: 1,
        })
      ).toBe(false);
    });

    it("allows ALL_IN and SHOWDOWN regardless of payload", () => {
      expect(
        shouldRunTableAnimationRequest({
          event: "ALL_IN",
          tier: 3,
          payload: { isHero: false },
        })
      ).toBe(true);
      expect(
        shouldRunTableAnimationRequest({
          event: "SHOWDOWN",
          tier: 2,
        })
      ).toBe(true);
    });
  });
});
