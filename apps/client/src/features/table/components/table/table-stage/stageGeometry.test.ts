import { describe, expect, it } from "vitest";
import {
  assignOpponentsToSlots,
  clampMaxSeats,
  projectPoint,
  resolveStageLayout,
  seatAnchorNorm,
  seatAnchors,
  STAGE_LAYOUT_NORM,
} from "./stageGeometry";

describe("stageGeometry", () => {
  it("clamps max seats", () => {
    expect(clampMaxSeats(1)).toBe(2);
    expect(clampMaxSeats(6)).toBe(6);
    expect(clampMaxSeats(12)).toBe(9);
  });

  it("places hero south in norm space", () => {
    const south = seatAnchorNorm(0, 6);
    expect(south.x).toBeCloseTo(STAGE_LAYOUT_NORM.rail.cx, 5);
    expect(south.y).toBeGreaterThan(STAGE_LAYOUT_NORM.rail.cy);
  });

  it("heads-up opponent is opposite north in norm space", () => {
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
    expect(aW).toHaveLength(6);
    expect(aN[0].x).toBeCloseTo(narrow.width * STAGE_LAYOUT_NORM.rail.cx, 0);
    expect(aW[0].x).toBeCloseTo(wide.width * STAGE_LAYOUT_NORM.rail.cx, 0);
    const p = projectPoint(seatAnchorNorm(0, 6), wide);
    expect(p.x).toBeCloseTo(aW[0].x, 0);
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
    expect(slots).toHaveLength(6);
    expect(slots[0]).toBeNull();
    expect(slots[1]).toBeNull();
    expect(slots[2]?.id).toBe("a");
    expect(slots[3]).toBeNull();
    expect(slots[4]).toBeNull();
    expect(slots[5]?.id).toBe("b");
  });

  it("rotates slots when hero is not seat 0", () => {
    const slots = assignOpponentsToSlots([{ seat: 0, id: "opp" }], 6, 3);
    // (0 - 3 + 6) % 6 = 3
    expect(slots[3]?.id).toBe("opp");
  });

  it("resolveStageLayout board and felt come from norm constants", () => {
    const stage = { width: 1000, height: 600 };
    const layout = resolveStageLayout(6, stage);
    expect(layout.felt.w).toBeCloseTo(1000 * STAGE_LAYOUT_NORM.felt.w, 0);
    expect(layout.board.h).toBeCloseTo(600 * STAGE_LAYOUT_NORM.board.h, 0);
    expect(layout.plate.width).toBeGreaterThanOrEqual(STAGE_LAYOUT_NORM.plateMinW);
    expect(layout.feltRadius).toBeCloseTo(Math.min(layout.felt.w, layout.felt.h) / 2, 0);
  });
});
