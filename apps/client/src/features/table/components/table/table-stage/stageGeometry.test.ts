import { describe, expect, it } from "vitest";
import {
  assignOpponentsToSlots,
  clampMaxSeats,
  resolveStageLayout,
  seatAnchorNorm,
  STAGE_LAYOUT_FELT_NORM,
  STAGE_LAYOUT_NORM,
} from "./stageGeometry";

describe("stageGeometry", () => {
  it("clamps max seats", () => {
    expect(clampMaxSeats(1)).toBe(2);
    expect(clampMaxSeats(6)).toBe(6);
    expect(clampMaxSeats(12)).toBe(9);
  });

  it("keeps rail outside the felt oval", () => {
    expect(STAGE_LAYOUT_NORM.rail.rx).toBeGreaterThan(STAGE_LAYOUT_NORM.felt.rx);
    expect(STAGE_LAYOUT_NORM.rail.ry).toBeGreaterThan(STAGE_LAYOUT_NORM.felt.ry);
  });

  it("places hero south on the outer rail", () => {
    const south = seatAnchorNorm(0, 6);
    const feltEdge = STAGE_LAYOUT_NORM.felt.cy + STAGE_LAYOUT_NORM.felt.ry;
    expect(south.y).toBeGreaterThan(feltEdge);
    expect(south.x).toBeCloseTo(STAGE_LAYOUT_NORM.rail.cx, 5);
  });

  it("felt rect matches felt oval", () => {
    expect(STAGE_LAYOUT_FELT_NORM.w).toBeCloseTo(2 * STAGE_LAYOUT_NORM.felt.rx, 5);
    expect(STAGE_LAYOUT_FELT_NORM.h).toBeCloseTo(2 * STAGE_LAYOUT_NORM.felt.ry, 5);
  });

  it("maps opponents by seat index with gaps", () => {
    const slots = assignOpponentsToSlots(
      [
        { seat: 2, id: "a" },
        { seat: 5, id: "b" },
      ],
      6,
      0,
    );
    expect(slots[2]?.id).toBe("a");
    expect(slots[5]?.id).toBe("b");
  });

  it("sizes card-dominant pods and large board zone", () => {
    const layout = resolveStageLayout(6, { width: 1000, height: 700 });
    expect(layout.plate.width).toBeGreaterThanOrEqual(STAGE_LAYOUT_NORM.plateMinW);
    expect(layout.plate.height).toBeGreaterThan(layout.plate.width);
    expect(layout.heroCardScale).toBeGreaterThan(layout.oppCardScale);
    expect(layout.heroCardScale).toBeGreaterThanOrEqual(0.9);
    expect(layout.board.w / 1000).toBeCloseTo(STAGE_LAYOUT_NORM.board.w, 2);
  });
});
