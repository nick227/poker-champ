import { describe, expect, it } from "vitest";
import { communityBoardScaleForBox } from "./communityBoardScale";

describe("communityBoardScaleForBox", () => {
  it("scales up for a large board box", () => {
    const large = communityBoardScaleForBox(520, 220, 16);
    const small = communityBoardScaleForBox(200, 100, 4);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(1.65);
    expect(small).toBeGreaterThanOrEqual(0.72);
  });

  it("falls back when box is empty", () => {
    expect(communityBoardScaleForBox(0, 0, 8)).toBeGreaterThan(0);
  });
});
