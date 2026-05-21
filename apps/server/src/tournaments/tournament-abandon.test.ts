import { describe, expect, it } from "vitest";
import { getMaxBlindLevel } from "./blind-structure.js";
import { isAtMaxBlindLevel } from "./tournament-abandon.js";

describe("tournament abandon blind cap", () => {
  it("detects max level for standard structure", () => {
    const max = getMaxBlindLevel("standard_8min");
    expect(max).toBe(10);
    expect(isAtMaxBlindLevel("standard_8min", max)).toBe(true);
    expect(isAtMaxBlindLevel("standard_8min", max - 1)).toBe(false);
  });
});
