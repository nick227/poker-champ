import { describe, expect, it } from "vitest";
import { arrangeSeatsAroundTable, nearestSeatPairIndex } from "./seatArrangement";

describe("arrangeSeatsAroundTable", () => {
  it("returns empty groups for 0 items", () => {
    const result = arrangeSeatsAroundTable([]);
    expect(result).toEqual({ top: [], left: [], right: [] });
  });

  it("puts a single opponent top-center (heads-up)", () => {
    const result = arrangeSeatsAroundTable(["a"]);
    expect(result.top).toEqual(["a"]);
    expect(result.left).toEqual([]);
    expect(result.right).toEqual([]);
  });

  it("splits an even count evenly with no top seat", () => {
    const result = arrangeSeatsAroundTable(["a", "b", "c", "d"]);
    expect(result.top).toEqual([]);
    expect(result.left.length).toBe(2);
    expect(result.right.length).toBe(2);
  });

  it("splits an odd count into one top seat + even sides", () => {
    const result = arrangeSeatsAroundTable(["a", "b", "c", "d", "e"]);
    expect(result.top.length).toBe(1);
    expect(result.left.length).toBe(2);
    expect(result.right.length).toBe(2);
  });

  it("matches the 7-opponent (9-max) reference arrangement: 1 top + 3 per side", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"];
    const result = arrangeSeatsAroundTable(items);
    // Middle item (index 3, "d") is directly across from the hero.
    expect(result.top).toEqual(["d"]);
    // Left column: nearest top-center first, nearest hero last.
    expect(result.left).toEqual(["c", "b", "a"]);
    // Right column: nearest top-center first, nearest hero last.
    expect(result.right).toEqual(["e", "f", "g"]);
  });

  it("never drops or duplicates an item, for every seat count from 0 to 9", () => {
    for (let n = 0; n <= 9; n++) {
      const items = Array.from({ length: n }, (_, i) => `seat-${i}`);
      const result = arrangeSeatsAroundTable(items);
      const all = [...result.left, ...result.top, ...result.right];
      expect(all.length).toBe(n);
      expect(new Set(all).size).toBe(n);
      for (const item of items) expect(all).toContain(item);
    }
  });

  it("keeps left/right columns the same length for every seat count", () => {
    for (let n = 0; n <= 9; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const result = arrangeSeatsAroundTable(items);
      expect(result.left.length).toBe(result.right.length);
      expect(result.top.length).toBeLessThanOrEqual(1);
    }
  });

  it("does not throw for large seat counts beyond typical max (defensive)", () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    expect(() => arrangeSeatsAroundTable(items)).not.toThrow();
    const result = arrangeSeatsAroundTable(items);
    expect(result.left.length + result.right.length + result.top.length).toBe(24);
  });
});

describe("nearestSeatPairIndex", () => {
  it("returns null when there are no side seats", () => {
    expect(nearestSeatPairIndex(arrangeSeatsAroundTable([]))).toBeNull();
    expect(nearestSeatPairIndex(arrangeSeatsAroundTable(["a"]))).toBeNull();
  });

  it("returns the last index of the side columns otherwise", () => {
    const result = arrangeSeatsAroundTable(["a", "b", "c", "d", "e"]);
    expect(nearestSeatPairIndex(result)).toBe(result.left.length - 1);
    // "a" was index 0 in the input (immediately after the hero going one way), so it's nearest
    // the hero on the left column; "e" was the last input item (immediately before the hero
    // going the other way), so it's nearest the hero on the right column.
    expect(result.left[nearestSeatPairIndex(result)!]).toBe("a");
    expect(result.right[nearestSeatPairIndex(result)!]).toBe("e");
  });
});
