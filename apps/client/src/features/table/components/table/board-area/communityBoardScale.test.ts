import { describe, expect, it } from "vitest";
import { communityBoardScaleForBox } from "./communityBoardScale";

describe("communityBoardScaleForBox", () => {
  it("scales up for a large board box", () => {
    const large = communityBoardScaleForBox(600, 280, 12);
    const small = communityBoardScaleForBox(220, 120, 4);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(2.5);
    expect(small).toBeGreaterThanOrEqual(0.65);
  });

  it("falls back when box is empty", () => {
    expect(communityBoardScaleForBox(0, 0, 8)).toBeGreaterThan(0);
  });

  it("keeps shallow desktop cards large enough to read", () => {
    expect(communityBoardScaleForBox(693, 183, 10)).toBeGreaterThan(1.5);
  });

  it("keeps card dimensions stable from flop through river", () => {
    const flop = communityBoardScaleForBox(680, 230, 10, 3);
    const fullBoard = communityBoardScaleForBox(680, 230, 10, 5);
    expect(flop).toBe(fullBoard);
    expect(flop).toBeLessThanOrEqual(2);
  });

  it("can enforce parity with player-card scale", () => {
    expect(communityBoardScaleForBox(260, 120, 4, 5, 0.82)).toBeGreaterThanOrEqual(0.82);
    expect(communityBoardScaleForBox(500, 180, 8, 5, 1.35)).toBeGreaterThanOrEqual(1.35);
  });
});
