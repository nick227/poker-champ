import { describe, expect, it } from "vitest";
import { mapAllInTier, mapPotWinTier, mapShowdownTier } from "../animationMapper";

describe("animationMapper", () => {
  describe("mapPotWinTier", () => {
    it("scales with pot size alone when no hand description is given", () => {
      expect(mapPotWinTier({ potCents: 0 })).toBe(0);
      expect(mapPotWinTier({ potCents: 500 })).toBe(1);
      expect(mapPotWinTier({ potCents: 2000 })).toBe(2);
      expect(mapPotWinTier({ potCents: 10000 })).toBe(3);
      expect(mapPotWinTier({ potCents: 50000 })).toBe(4);
    });

    it("boosts tier for a strong hand on a small pot, clamped at 4", () => {
      expect(mapPotWinTier({ potCents: 0, winningHandDescr: "Four of a Kind" })).toBe(4);
      expect(mapPotWinTier({ potCents: 0, winningHandDescr: "Pair of Aces" })).toBe(1);
      expect(mapPotWinTier({ potCents: 50000, winningHandDescr: "Royal Flush" })).toBe(4);
    });

    it("is case-insensitive on the hand description", () => {
      expect(mapPotWinTier({ potCents: 0, winningHandDescr: "FLUSH, King High" })).toBe(3);
    });
  });

  describe("mapAllInTier", () => {
    it("scales with pot size and adds a boost for big bets", () => {
      expect(mapAllInTier({ potCents: 0, amountCents: 100 })).toBe(0);
      expect(mapAllInTier({ potCents: 0, amountCents: 5000 })).toBe(1);
      expect(mapAllInTier({ potCents: 10000, amountCents: 100 })).toBe(3);
      expect(mapAllInTier({ potCents: 10000, amountCents: 5000 })).toBe(4);
    });

    it("clamps at tier 4", () => {
      expect(mapAllInTier({ potCents: 50000, amountCents: 50000 })).toBe(4);
    });
  });

  describe("mapShowdownTier", () => {
    it("scales with pot size alone when hero is not the winner", () => {
      expect(mapShowdownTier({ potCents: 0, isHeroWinner: false })).toBe(0);
      expect(mapShowdownTier({ potCents: 50000, isHeroWinner: false })).toBe(4);
    });

    it("ignores winningHandDescr when hero did not win (not hero's own hand)", () => {
      // Even though the descr implies a monster hand, it belongs to the opponent who beat hero.
      expect(
        mapShowdownTier({ potCents: 0, isHeroWinner: false, winningHandDescr: "Royal Flush" })
      ).toBe(0);
    });

    it("boosts tier using hand strength only when hero is the winner", () => {
      expect(
        mapShowdownTier({ potCents: 0, isHeroWinner: true, winningHandDescr: "Four of a Kind" })
      ).toBe(4);
      expect(
        mapShowdownTier({ potCents: 0, isHeroWinner: true, winningHandDescr: "Pair of Twos" })
      ).toBe(1);
    });

    it("combines pot size and hero's own hand strength, clamped at 4", () => {
      expect(
        mapShowdownTier({ potCents: 50000, isHeroWinner: true, winningHandDescr: "Royal Flush" })
      ).toBe(4);
      expect(
        mapShowdownTier({ potCents: 2000, isHeroWinner: true, winningHandDescr: "Straight" })
      ).toBe(4);
    });
  });
});
