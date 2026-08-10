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

  it("keeps rail just outside the felt (no floating void gap)", () => {
    const { felt, rail } = STAGE_LAYOUT_NORM;
    expect(rail.rx).toBeGreaterThan(felt.rx);
    expect(rail.ry).toBeGreaterThan(felt.ry);
    // Avatar should sit on the cushion — not a large dark band away from felt.
    expect(rail.rx - felt.rx).toBeLessThan(0.05);
    expect(rail.ry - felt.ry).toBeLessThan(0.05);
  });

  it("places hero south on the felt rim", () => {
    const south = seatAnchorNorm(0, 6);
    const feltEdge = STAGE_LAYOUT_NORM.felt.cy + STAGE_LAYOUT_NORM.felt.ry;
    expect(south.y).toBeGreaterThan(feltEdge);
    expect(south.y - feltEdge).toBeLessThan(0.05);
  });

  it("keeps all seat pods fully on-screen", () => {
    const stage = { width: 900, height: 560 };
    const layout = resolveStageLayout(6, stage);
    const avatarCenterFromTop = layout.cardPeek + layout.avatarSize / 2;
    for (const s of layout.seats) {
      const top = s.y - avatarCenterFromTop;
      const bottom = top + layout.plate.height;
      expect(top).toBeGreaterThanOrEqual(STAGE_LAYOUT_NORM.stagePad - 0.5);
      const bottomPad = s.slotIndex === 0 ? 2 : STAGE_LAYOUT_NORM.stagePad;
      expect(bottom).toBeLessThanOrEqual(stage.height - bottomPad + 0.5);
    }
  });

  it("builds short compact pods (not card-tall towers)", () => {
    const layout = resolveStageLayout(6, { width: 1000, height: 700 });
    expect(layout.plate.height).toBeLessThan(layout.plate.width * 1.3);
    expect(layout.plate.height).toBeLessThan(185);
    expect(layout.heroCardScale).toBeLessThan(1.4);
    expect(layout.heroCardScale).toBeGreaterThan(layout.oppCardScale);
  });

  it("keeps the felt and player pods large in a shallow desktop stage", () => {
    const stage = { width: 1920, height: 552 };
    const layout = resolveStageLayout(6, stage);

    expect(layout.felt.w / stage.width).toBeCloseTo(0.86, 2);
    expect(layout.plate.width).toBeGreaterThanOrEqual(230);
    expect(layout.board.w / layout.felt.w).toBeCloseTo(0.46, 2);
  });

  it("gives the board more width on medium and compact stages", () => {
    const medium = resolveStageLayout(6, { width: 1365, height: 540 });
    const compact = resolveStageLayout(6, { width: 390, height: 620 });

    expect(medium.board.w / medium.felt.w).toBeCloseTo(0.5, 2);
    expect(compact.board.w / compact.felt.w).toBeCloseTo(0.78, 2);
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
