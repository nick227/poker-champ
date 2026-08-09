import { describe, expect, it } from "vitest";
import { assignOpponentsToSlots, clampMaxSeats, seatAnchors } from "./stageGeometry";

describe("stageGeometry", () => {
  it("clamps max seats", () => {
    expect(clampMaxSeats(1)).toBe(2);
    expect(clampMaxSeats(6)).toBe(6);
    expect(clampMaxSeats(12)).toBe(9);
  });

  it("places hero south and keeps slot count stable", () => {
    const stage = { width: 1000, height: 600 };
    const a6 = seatAnchors(6, stage);
    expect(a6).toHaveLength(6);
    expect(a6[0].slotIndex).toBe(0);
    // South: x near center, y below center
    expect(a6[0].x).toBeCloseTo(500, 0);
    expect(a6[0].y).toBeGreaterThan(300);

    const a2 = seatAnchors(2, stage);
    expect(a2).toHaveLength(2);
    // Heads-up: opponent opposite (north)
    expect(a2[1].y).toBeLessThan(300);
  });

  it("assigns opponents without changing slot count", () => {
    const slots = assignOpponentsToSlots(["a", "b"], 6);
    expect(slots).toHaveLength(6);
    expect(slots[0]).toBeNull();
    expect(slots[1]).toBe("a");
    expect(slots[2]).toBe("b");
    expect(slots[3]).toBeNull();
  });
});
