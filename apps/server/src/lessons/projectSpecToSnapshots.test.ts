import { describe, expect, it } from "vitest";
import { projectSpecToSnapshots } from "./projectSpecToSnapshots.js";
import type { MinimalHandSpec } from "./minimalHandSpec.types.js";

function makeSpec(heroSeat: number): MinimalHandSpec {
  return {
    specVersion: 1,
    lessonTitle: "Spec Lesson",
    players: 2,
    playersInfo: [
      { seat: 1, position: "BB", name: "Villain" },
      { seat: 2, position: "BTN", name: "Hero" },
    ],
    heroSeat,
    blinds: { sb: 0.5, bb: 1 },
    startingStacksBB: 100,
    heroHoleCards: ["As", "Kh"],
    board: [],
    actions: [
      {
        street: "PREFLOP",
        actorSeat: heroSeat,
        action: "RAISE",
        sizeBB: 2.5,
        isHeroDecision: true,
      },
    ],
  };
}

describe("projectSpecToSnapshots", () => {
  it("emits unique occupied seat userIds for generated lesson snapshots", () => {
    const result = projectSpecToSnapshots(makeSpec(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snapshot = result.points[0]?.snapshot;
    expect(snapshot).toBeDefined();
    const occupiedUserIds = snapshot!.seats.filter((seat) => seat.occupied).map((seat) => seat.userId);
    expect(new Set(occupiedUserIds).size).toBe(occupiedUserIds.length);
    expect(snapshot!.hero.userId).toBe("hero_user");
    expect(snapshot!.seats.find((seat) => seat.seat === snapshot!.hero.seat)?.userId).toBe("hero_user");
  });
});
