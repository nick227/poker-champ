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

/** Board is only as wide as the community-card row; a headline needs full table-width breathing
 * room or it clips. Width is generous on purpose — an oversized box just extends past the visible
 * table (harmless, still clipped by the physical viewport) rather than truncating the text. */
const ABOVE_BOARD_WIDTH_MULTIPLIER = 2.4;
/** Fixed banner height for a single line of headline text, not derived from the board's own
 * (card-row) height, which is often taller than one line needs and would push the banner up into
 * the seat above it. */
const ABOVE_BOARD_HEIGHT = 90;

/** A rect stacked flush above `board` (bottom edge == board's top edge, so it can never cover the
 * community cards) and widened around board's horizontal center (so the headline never clips). */
function resolveAboveBoardRect(board: Rect): Rect {
  const width = board.width * ABOVE_BOARD_WIDTH_MULTIPLIER;
  return {
    x: board.x + board.width / 2 - width / 2,
    y: board.y - ABOVE_BOARD_HEIGHT,
    width,
    height: ABOVE_BOARD_HEIGHT,
  };
}

/** Single anchor→rect. TABLE_CENTER → undefined. */
export function resolveAnchorToRect(
  effectiveAnchor: AnimationAnchor,
  seatIndex: number | undefined,
  anchorBounds: AnchorBounds
): Rect | undefined {
  if (effectiveAnchor === FX_ANCHOR.TABLE_CENTER) return undefined;
  if (effectiveAnchor === FX_ANCHOR.HERO && anchorBounds.hero) return anchorBounds.hero;
  if (effectiveAnchor === FX_ANCHOR.BOARD && anchorBounds.board) return anchorBounds.board;
  if (effectiveAnchor === FX_ANCHOR.ABOVE_BOARD && anchorBounds.board) {
    return resolveAboveBoardRect(anchorBounds.board);
  }
  if (effectiveAnchor === FX_ANCHOR.SEAT && seatIndex != null) {
    // Hero's own seat never has a seatByIndex entry (hero reports bounds separately, via
    // `hero`, not the opponent-only `reportSeatBounds` path) — without this, any SEAT-anchored
    // companion whose seat index happens to be hero's own (e.g. ALL_IN/POT_WIN's own seat-ring
    // companions, both hero-only events, or WINNER_REVEAL when hero is the winner) would
    // silently fail to find a rect and never render.
    if (seatIndex === anchorBounds.heroSeat && anchorBounds.hero) return anchorBounds.hero;
    return anchorBounds.seatByIndex?.[seatIndex];
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
