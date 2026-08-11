import { describe, expect, it } from "vitest";
import { resolveStageLayout } from "./stageGeometry";
import { resolveBetMarkerCenter } from "./SeatFeltMarkers";

const MARKER_HALF_HEIGHT = 14;
const REQUIRED_GAP = 8;

describe("resolveBetMarkerCenter", () => {
  const layout = resolveStageLayout(2, { width: 390, height: 700 });
  const feltCenter = {
    x: layout.felt.x + layout.felt.w / 2,
    y: layout.felt.y + layout.felt.h / 2,
  };
  const avatarCenterFromTop = layout.cardPeek + layout.avatarSize / 2;

  function markerFor(slotIndex: number) {
    return resolveBetMarkerCenter({
      seat: layout.seats[slotIndex],
      feltCenter,
      plateWidth: layout.plate.width,
      plateHeight: layout.plate.height,
      avatarSize: layout.avatarSize,
      cardPeek: layout.cardPeek,
    });
  }

  it("parks the hero ante above the hole-card edge on mobile", () => {
    const hero = layout.seats[0];
    const marker = markerFor(0);
    const plateTop = hero.y - avatarCenterFromTop;

    expect(marker.y + MARKER_HALF_HEIGHT).toBeLessThanOrEqual(plateTop - REQUIRED_GAP + 0.01);
  });

  it("parks the opponent ante below the bankroll edge on mobile", () => {
    const opponent = layout.seats[1];
    const marker = markerFor(1);
    const plateBottom = opponent.y - avatarCenterFromTop + layout.plate.height;

    expect(marker.y - MARKER_HALF_HEIGHT).toBeGreaterThanOrEqual(
      plateBottom + REQUIRED_GAP - 0.01,
    );
  });
});
