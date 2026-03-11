import { describe, expect, it } from "vitest";
import { FX_ANCHOR, type AnchorBounds, type Rect, type TableAnimationDefinition } from "../animationTypes";
import { getAnchorRect, getAnchorRectForLayer, getCardSlotRects, resolveAnchorToRect } from "../anchorResolution";

describe("anchorResolution", () => {
  it("resolveAnchorToRect resolves HERO/BOARD/SEAT and returns undefined for TABLE_CENTER", () => {
    const hero: Rect = { x: 1, y: 2, width: 3, height: 4 };
    const board: Rect = { x: 10, y: 20, width: 30, height: 40 };
    const seat3: Rect = { x: 7, y: 8, width: 9, height: 10 };
    const bounds: AnchorBounds = { hero, board, seatByIndex: { 3: seat3 } };

    expect(resolveAnchorToRect(FX_ANCHOR.TABLE_CENTER, undefined, bounds)).toBeUndefined();
    expect(resolveAnchorToRect(FX_ANCHOR.HERO, undefined, bounds)).toEqual(hero);
    expect(resolveAnchorToRect(FX_ANCHOR.BOARD, undefined, bounds)).toEqual(board);
    expect(resolveAnchorToRect(FX_ANCHOR.SEAT, 3, bounds)).toEqual(seat3);
    expect(resolveAnchorToRect(FX_ANCHOR.SEAT, 2, bounds)).toBeUndefined();
  });

  it("getCardSlotRects filters undefined slots", () => {
    const r0: Rect = { x: 0, y: 0, width: 1, height: 1 };
    const r2: Rect = { x: 2, y: 2, width: 1, height: 1 };
    const bounds: AnchorBounds = { cardSlots: [r0, undefined, r2] };
    expect(getCardSlotRects(bounds)).toEqual([r0, r2]);
  });

  it("getAnchorRect uses def.anchor and payload.anchorSeat for SEAT", () => {
    const seat5: Rect = { x: 5, y: 5, width: 5, height: 5 };
    const bounds: AnchorBounds = { seatByIndex: { 5: seat5 } };
    const def: TableAnimationDefinition = {
      id: "X",
      event: "POT_WIN",
      tier: 1,
      channel: "TABLE",
      anchor: FX_ANCHOR.SEAT,
      durationMs: 1000,
      layers: [{ type: "FLASH" }],
    };
    expect(getAnchorRect(def, { anchorSeat: 5 }, bounds)).toEqual(seat5);
  });

  it("getAnchorRectForLayer prefers seatIndexFromPayload when provided", () => {
    const seat1: Rect = { x: 1, y: 1, width: 1, height: 1 };
    const seat9: Rect = { x: 9, y: 9, width: 9, height: 9 };
    const bounds: AnchorBounds = { seatByIndex: { 1: seat1, 9: seat9 } };
    const def: TableAnimationDefinition = {
      id: "X",
      event: "POT_WIN",
      tier: 1,
      channel: "TABLE",
      anchor: FX_ANCHOR.SEAT,
      durationMs: 1000,
      layers: [{ type: "FLASH" }],
    };

    const layer = { type: "RING" as const, anchor: FX_ANCHOR.SEAT, seatIndexFromPayload: "winnerSeat" as const };
    expect(getAnchorRectForLayer(layer, def, { anchorSeat: 1, winnerSeat: 9 }, bounds)).toEqual(seat9);
  });
});

