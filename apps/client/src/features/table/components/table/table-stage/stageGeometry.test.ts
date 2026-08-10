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

  it("uses an oblong felt (wider than tall)", () => {
    expect(STAGE_LAYOUT_NORM.felt.rx).toBeGreaterThan(STAGE_LAYOUT_NORM.felt.ry * 1.4);
    expect(STAGE_LAYOUT_FELT_NORM.w).toBeGreaterThan(STAGE_LAYOUT_FELT_NORM.h);
  });

  it("keeps rail outside the felt oval", () => {
    expect(STAGE_LAYOUT_NORM.rail.rx).toBeGreaterThan(STAGE_LAYOUT_NORM.felt.rx);
    expect(STAGE_LAYOUT_NORM.rail.ry).toBeGreaterThan(STAGE_LAYOUT_NORM.felt.ry);
  });

  it("places hero south outside the felt", () => {
    const south = seatAnchorNorm(0, 6);
    const feltEdge = STAGE_LAYOUT_NORM.felt.cy + STAGE_LAYOUT_NORM.felt.ry;
    expect(south.y).toBeGreaterThan(feltEdge);
  });

  it("keeps all seat pods fully on-screen", () => {
    const stage = { width: 900, height: 560 };
    const layout = resolveStageLayout(6, stage);
    const avatarCenterFromTop = layout.cardPeek + layout.avatarSize / 2;
    for (const s of layout.seats) {
      const top = s.y - avatarCenterFromTop;
      const bottom = top + layout.plate.height;
      expect(top).toBeGreaterThanOrEqual(STAGE_LAYOUT_NORM.stagePad - 0.5);
      expect(bottom).toBeLessThanOrEqual(stage.height - STAGE_LAYOUT_NORM.stagePad + 0.5);
    }
  });

  it("builds short compact pods (not card-tall towers)", () => {
    const layout = resolveStageLayout(6, { width: 1000, height: 700 });
    expect(layout.plate.height).toBeLessThan(layout.plate.width * 1.15);
    expect(layout.plate.height).toBeLessThan(140);
    expect(layout.heroCardScale).toBeLessThan(0.85);
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
});
