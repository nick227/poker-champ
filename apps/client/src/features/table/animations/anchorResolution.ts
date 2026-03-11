/**
 * Anchor → rect resolution for TABLE FX overlay.
 * Definition anchor controls channel container; layer anchor overrides per-layer positioning.
 */
import type {
  TableAnimationRequest,
  TableAnimationDefinition,
  AnchorBounds,
  Rect,
  AnimationLayerDefinition,
  AnimationAnchor,
} from "./animationTypes";
import { FX_ANCHOR } from "./animationTypes";

/** Single anchor→rect. TABLE_CENTER → undefined. */
export function resolveAnchorToRect(
  effectiveAnchor: AnimationAnchor,
  seatIndex: number | undefined,
  anchorBounds: AnchorBounds
): Rect | undefined {
  if (effectiveAnchor === FX_ANCHOR.TABLE_CENTER) return undefined;
  if (effectiveAnchor === FX_ANCHOR.HERO && anchorBounds.hero) return anchorBounds.hero;
  if (effectiveAnchor === FX_ANCHOR.BOARD && anchorBounds.board) return anchorBounds.board;
  if (effectiveAnchor === FX_ANCHOR.SEAT && seatIndex != null && anchorBounds.seatByIndex) {
    return anchorBounds.seatByIndex[seatIndex];
  }
  return undefined;
}

/** Def-level anchor → rect (for channel container). */
export function getAnchorRect(
  def: TableAnimationDefinition,
  payload: TableAnimationRequest["payload"],
  anchorBounds?: AnchorBounds
): Rect | undefined {
  if (!anchorBounds) return undefined;
  const seatIndex = def.anchor === FX_ANCHOR.SEAT ? payload?.anchorSeat : undefined;
  return resolveAnchorToRect(def.anchor, seatIndex, anchorBounds);
}

/** Per-layer anchor. TABLE_CENTER → undefined. CARD → use getCardSlotRects. */
export function getAnchorRectForLayer(
  layer: AnimationLayerDefinition,
  def: TableAnimationDefinition,
  payload: TableAnimationRequest["payload"],
  anchorBounds?: AnchorBounds
): Rect | undefined {
  if (!anchorBounds) return undefined;
  const effectiveAnchor = ("anchor" in layer ? layer.anchor : undefined) ?? def.anchor;
  if (effectiveAnchor === FX_ANCHOR.CARD) return undefined;
  const seatIndex =
    effectiveAnchor === FX_ANCHOR.SEAT && "seatIndexFromPayload" in layer && layer.seatIndexFromPayload
      ? (payload as TableAnimationRequest["payload"])?.[layer.seatIndexFromPayload]
      : payload?.anchorSeat;
  return resolveAnchorToRect(effectiveAnchor, seatIndex, anchorBounds);
}

/** CARD anchor: one rect per slot. Returns only defined rects (filters out undefined slots). */
export function getCardSlotRects(anchorBounds?: AnchorBounds): Rect[] {
  if (!anchorBounds?.cardSlots?.length) return [];
  return anchorBounds.cardSlots.filter((r): r is Rect => r != null);
}
