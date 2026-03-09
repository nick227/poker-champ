import type { FeltGradient } from "./background.types";
import type { BackgroundImageId } from "./background.types";
import type { SurfaceBackground } from "./background.types";

const CLEARED: SurfaceBackground = { color: null, imageId: null, gradient: null };

/**
 * Single source of truth for legacy field values derived from a surface.
 * Use whenever updating appBackground or feltBackground in the store to avoid drift.
 */
export function deriveLegacyFromSurface(bg: SurfaceBackground): {
  color: string | null;
  imageId: string | null;
  gradient: FeltGradient | null;
} {
  return {
    color: bg.color,
    imageId: bg.imageId,
    gradient: bg.gradient,
  };
}

/** Next app background: set color (clears imageId and gradient). */
export function nextAppBackgroundColor(
  _current: SurfaceBackground,
  color: string
): SurfaceBackground {
  return { color, imageId: null, gradient: null };
}

/** Next app background: set image (clears gradient). */
export function nextAppBackgroundImageId(
  current: SurfaceBackground,
  imageId: BackgroundImageId
): SurfaceBackground {
  return { color: current.color, imageId, gradient: null };
}

/** Next app background: set gradient (clears imageId). */
export function nextAppBackgroundGradient(
  current: SurfaceBackground,
  gradient: FeltGradient
): SurfaceBackground {
  return { color: current.color, imageId: null, gradient };
}

/** Next app background: clear to none (default token). */
export function nextAppBackgroundCleared(): SurfaceBackground {
  return { ...CLEARED };
}

/** Next felt background: set color (clears imageId and gradient). */
export function nextFeltBackgroundColor(
  _current: SurfaceBackground,
  color: string
): SurfaceBackground {
  return { color, imageId: null, gradient: null };
}

/** Next felt background: set image (clears gradient). */
export function nextFeltBackgroundImageId(
  current: SurfaceBackground,
  imageId: BackgroundImageId
): SurfaceBackground {
  return { color: current.color, imageId, gradient: null };
}

/** Next felt background: set gradient (clears imageId). */
export function nextFeltBackgroundGradient(
  current: SurfaceBackground,
  gradient: FeltGradient
): SurfaceBackground {
  return { color: current.color, imageId: null, gradient };
}

/** Next felt background: clear to none. */
export function nextFeltBackgroundCleared(): SurfaceBackground {
  return { ...CLEARED };
}
