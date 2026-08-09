import { describe, expect, it } from "vitest";
import {
  POT_STACK_MAX_CHIPS_PER_COLUMN,
  POT_STACK_MAX_COLUMNS,
  computePotStackColumns,
  computePotStackHeight,
} from "./potChipStack.logic";

describe("computePotStackColumns", () => {
  it("renders no columns when there's no pot", () => {
    expect(computePotStackColumns(0)).toBe(0);
    expect(computePotStackColumns(-5)).toBe(0);
    expect(computePotStackColumns(NaN)).toBe(0);
  });

  it("scales up with pot size, clamped to the max column count", () => {
    const small = computePotStackColumns(300);
    const big = computePotStackColumns(500_000_00);
    expect(small).toBeGreaterThanOrEqual(1);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(POT_STACK_MAX_COLUMNS);
  });
});

describe("computePotStackHeight", () => {
  it("is 0 when there's no pot", () => {
    expect(computePotStackHeight(0)).toBe(0);
  });

  it("scales up with pot size, clamped to the max stack height", () => {
    const small = computePotStackHeight(300);
    const big = computePotStackHeight(500_000_00);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(POT_STACK_MAX_CHIPS_PER_COLUMN);
  });
});
