import { describe, it, expect } from "vitest";
import { hueFromSeed, getAvatarColors } from "./avatarColor";

describe("hueFromSeed", () => {
  it("is deterministic: same seed always yields the same hue", () => {
    const a = hueFromSeed("user-123");
    const b = hueFromSeed("user-123");
    expect(a).toBe(b);
  });

  it("stays in the 0-359 range", () => {
    for (const seed of ["a", "user-123", "Nick Rios", "", "🙂emoji-seed"]) {
      const hue = hueFromSeed(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("produces different-enough hues for different seeds", () => {
    const seeds = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"];
    const hues = seeds.map(hueFromSeed);
    const distinct = new Set(hues);
    // Not a strict collision-free guarantee, but a small fixed set of short
    // names should not all collapse onto the same hue.
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("does not throw for an empty seed and still returns a stable value", () => {
    expect(hueFromSeed("")).toBe(hueFromSeed(""));
  });
});

describe("getAvatarColors", () => {
  it("is deterministic across calls for the same seed", () => {
    const first = getAvatarColors("user-abc");
    const second = getAvatarColors("user-abc");
    expect(second).toEqual(first);
  });

  it("derives base/light/dark/ring from the same hue", () => {
    const colors = getAvatarColors("user-abc");
    expect(colors.base).toContain(`hsl(${colors.hue},`);
    expect(colors.light).toContain(`hsl(${colors.hue},`);
    expect(colors.dark).toContain(`hsl(${colors.hue},`);
    expect(colors.ring).toContain(`hsl(${colors.hue},`);
  });

  it("gives different users different colors most of the time", () => {
    const a = getAvatarColors("playerOne");
    const b = getAvatarColors("playerTwo");
    expect(a).not.toEqual(b);
  });
});
