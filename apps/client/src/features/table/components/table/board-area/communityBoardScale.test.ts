import { describe, expect, it } from "vitest";
import { communityBoardScaleForBox } from "./communityBoardScale";

describe("communityBoardScaleForBox", () => {
  it("scales up for a large board box", () => {
    const large = communityBoardScaleForBox(600, 280, 12);
    const small = communityBoardScaleForBox(220, 120, 4);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(1.9);
    expect(small).toBeGreaterThanOrEqual(0.95);
  });

  it("falls back when box is empty", () => {
    expect(communityBoardScaleForBox(0, 0, 8)).toBeGreaterThan(0);
  });
});
