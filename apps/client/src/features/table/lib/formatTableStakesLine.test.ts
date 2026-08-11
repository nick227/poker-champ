import { describe, expect, it } from "vitest";
import { formatTableStakesLine } from "./formatTableStakesLine";

describe("formatTableStakesLine", () => {
  it("formats blinds and min buy-in when both are known", () => {
    expect(formatTableStakesLine(100, 200, 10000)).toMatch(/^Blinds \$1 \| \$2.*Min \$100$/);
  });

  it("returns null when no blinds or min buy-in are known", () => {
    expect(formatTableStakesLine()).toBeNull();
  });

  it("falls back to a min-only line when blinds are unknown", () => {
    expect(formatTableStakesLine(undefined, undefined, 5000)).toBe("Min $50");
  });
});
