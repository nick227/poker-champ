/**
 * Pure logic for the pot → winner chip-stack "travel" animation (the bet → pot leg was removed;
 * see git history if a "your chips slide to the pot" cue is ever wanted back — this is now the
 * only leg of the chip's journey, so there's no "kind" left to distinguish).
 * No React, no game logic: given measured rects (from AnchorBounds) and an amount,
 * computes a plan the visual layer can animate. Kept pure/testable — see chipTravel.test.ts.
 */
import type { Rect } from "./animationTypes";
import {
  CHIP_TRAVEL_MIN_DURATION_MS,
  CHIP_TRAVEL_MAX_DURATION_MS,
  CHIP_TRAVEL_MIN_CHIPS,
  CHIP_TRAVEL_MAX_CHIPS,
  CHIP_TRAVEL_STAGGER_MS,
} from "./animationConstants";

export type ChipTravelPlan = {
  id: string;
  from: Rect;
  to: Rect;
  amountCents: number;
  /** Visual chip count in the traveling stack; not a literal chip denomination count. */
  chipCount: number;
  /** Total ms for one chip's flight (excludes stagger added for later chips in the stack). */
  durationMs: number;
};

/** ms of flight time added per pixel of on-screen distance between endpoints. */
const MS_PER_PX = 0.55;

export { CHIP_TRAVEL_MIN_DURATION_MS, CHIP_TRAVEL_MAX_DURATION_MS, CHIP_TRAVEL_MIN_CHIPS, CHIP_TRAVEL_MAX_CHIPS, CHIP_TRAVEL_STAGGER_MS };

function rectCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function distanceBetween(a: Rect, b: Rect): number {
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  return Math.hypot(cb.x - ca.x, cb.y - ca.y);
}

/** Flight duration for a single chip, scaled by distance and clamped to a natural range. */
export function computeChipTravelDurationMs(from: Rect, to: Rect): number {
  const raw = distanceBetween(from, to) * MS_PER_PX;
  return Math.round(Math.min(CHIP_TRAVEL_MAX_DURATION_MS, Math.max(CHIP_TRAVEL_MIN_DURATION_MS, raw)));
}

/** More chips in the stack for bigger amounts (roughly logarithmic), clamped to a small readable range. */
export function computeChipCount(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return CHIP_TRAVEL_MIN_CHIPS;
  const extra = Math.floor(Math.log2(amountCents / 100 + 1));
  return Math.min(CHIP_TRAVEL_MAX_CHIPS, Math.max(CHIP_TRAVEL_MIN_CHIPS, CHIP_TRAVEL_MIN_CHIPS + extra));
}

/** Total ms the overlay must keep a plan mounted (last chip's stagger delay + its own flight). */
export function computeChipTravelTotalMs(plan: Pick<ChipTravelPlan, "chipCount" | "durationMs">): number {
  return (plan.chipCount - 1) * CHIP_TRAVEL_STAGGER_MS + plan.durationMs;
}

function isMeasuredRect(r: Rect | undefined): r is Rect {
  return r != null && r.width > 0 && r.height > 0;
}

export type BuildChipTravelPlanParams = {
  id: string;
  from: Rect | undefined;
  to: Rect | undefined;
  amountCents: number;
};

/**
 * Builds a travel plan from measured rects, or returns undefined when either endpoint
 * hasn't been measured yet (e.g. layout not mounted) — callers should skip enqueueing in that case.
 */
export function buildChipTravelPlan({
  id,
  from,
  to,
  amountCents,
}: BuildChipTravelPlanParams): ChipTravelPlan | undefined {
  if (!isMeasuredRect(from) || !isMeasuredRect(to)) return undefined;
  return {
    id,
    from,
    to,
    amountCents,
    chipCount: computeChipCount(amountCents),
    durationMs: computeChipTravelDurationMs(from, to),
  };
}
