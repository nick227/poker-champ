import { describe, expect, it } from "vitest";
import {
  assignOpponentsToSlots,
  clampMaxSeats,
  projectPoint,
  resolveStageLayout,
  seatAnchorNorm,
  seatAnchors,
  STAGE_LAYOUT_FELT_NORM,
  STAGE_LAYOUT_NORM,
} from "./stageGeometry";

describe("stageGeometry", () => {
  it("clamps max seats", () => {
    expect(clampMaxSeats(1)).toBe(2);
    expect(clampMaxSeats(6)).toBe(6);
    expect(clampMaxSeats(12)).toBe(9);
  });

  it("places hero south and outside play oval", () => {
    const south = seatAnchorNorm(0, 6);
    expect(south.x).toBeCloseTo(STAGE_LAYOUT_NORM.rail.cx, 5);
    expect(south.y).toBeGreaterThan(STAGE_LAYOUT_NORM.play.cy + STAGE_LAYOUT_NORM.play.ry);
    expect(south.y).toBeLessThan(0.95);
  });

  it("rail sits outside play oval", () => {
    expect(STAGE_LAYOUT_NORM.rail.rx).toBeGreaterThan(STAGE_LAYOUT_NORM.play.rx);
    expect(STAGE_LAYOUT_NORM.rail.ry).toBeGreaterThan(STAGE_LAYOUT_NORM.play.ry);
  });

  it("felt bbox wraps rail ellipse", () => {
    const { rail, feltPad } = STAGE_LAYOUT_NORM;
    expect(STAGE_LAYOUT_FELT_NORM.w).toBeCloseTo(2 * (rail.rx + feltPad), 5);
    expect(STAGE_LAYOUT_FELT_NORM.h).toBeCloseTo(2 * (rail.ry + feltPad), 5);
  });

  it("heads-up opponent is opposite north", () => {
    const north = seatAnchorNorm(1, 2);
    expect(north.x).toBeCloseTo(STAGE_LAYOUT_NORM.rail.cx, 5);
    expect(north.y).toBeLessThan(STAGE_LAYOUT_NORM.rail.cy);
  });

  it("projects norm anchors into pixels for different stages", () => {
    const narrow = { width: 390, height: 700 };
    const wide = { width: 1280, height: 720 };
    const aN = seatAnchors(6, narrow);
    const aW = seatAnchors(6, wide);
    expect(aN).toHaveLength(6);
    expect(aW[0].x).toBeCloseTo(wide.width * STAGE_LAYOUT_NORM.rail.cx, 0);
    const p = projectPoint(seatAnchorNorm(0, 6), wide);
    expect(p.x).toBeCloseTo(aW[0].x, 0);
    // Desktop pods grow with felt, not stuck at tiny min forever on tall stages
    const wideLayout = resolveStageLayout(6, wide);
    const phoneLayout = resolveStageLayout(6, narrow);
    expect(wideLayout.plate.width).toBeGreaterThanOrEqual(phoneLayout.plate.width);
  });

  it("maps opponents by seat index from hero, keeping gaps", () => {
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
    expect(slots[1]).toBeNull();
  });

  it("resolveStageLayout board and felt come from norm constants", () => {
    const stage = { width: 1000, height: 600 };
    const layout = resolveStageLayout(6, stage);
    expect(layout.felt.w).toBeCloseTo(1000 * STAGE_LAYOUT_FELT_NORM.w, 0);
    expect(layout.board.h).toBeCloseTo(600 * STAGE_LAYOUT_NORM.board.h, 0);
    expect(layout.plate.width).toBeGreaterThanOrEqual(STAGE_LAYOUT_NORM.plateMinW);
  });
});
