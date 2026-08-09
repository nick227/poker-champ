/**
 * Pure helpers for deriving the felt's radial-shading stops from the user's resolved felt color.
 * No React, no game logic — kept pure/testable (mirrors the convention in animations/chipTravel.ts).
 */
import type { ResolvedBackground } from "@/theme/backgrounds/background.types";
import { FELT_SHADING_DELTA, FELT_SHADING_FALLBACK_HSL } from "../tokens/felt.tokens";

export type HslTriplet = { h: number; s: number; l: number };

const HSL_TRIPLET_RE = /^\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/;

/** Parses the app's "H S% L%" felt-color format (no hsl() wrapper). Returns null if malformed. */
export function parseHslTriplet(value: string | null | undefined): HslTriplet | null {
  if (!value) return null;
  const match = HSL_TRIPLET_RE.exec(value);
  if (!match) return null;
  const [, h, s, l] = match;
  return { h: Number(h), s: Number(s), l: Number(l) };
}

function clampPercent(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function hslTripletToCss({ h, s, l }: HslTriplet): string {
  return `hsl(${h}, ${clampPercent(s)}%, ${clampPercent(l)}%)`;
}

export type FeltShadingStops = { center: string; mid: string; edge: string };

/** Builds the three radial-shading stops (center/mid/edge) from a base felt HSL triplet. */
export function buildFeltShadingStops(
  base: HslTriplet,
  deltas: { center: number; mid: number; edge: number } = FELT_SHADING_DELTA,
): FeltShadingStops {
  return {
    center: hslTripletToCss({ ...base, l: clampPercent(base.l + deltas.center) }),
    mid: hslTripletToCss({ ...base, l: clampPercent(base.l + deltas.mid) }),
    edge: hslTripletToCss({ ...base, l: clampPercent(base.l + deltas.edge) }),
  };
}

/** CSS radial-gradient for the felt's web rendering. Light source biased slightly above center,
 *  matching where the community cards + pot sit. */
export function buildFeltRadialGradientCss(stops: FeltShadingStops): string {
  return `radial-gradient(ellipse 85% 90% at 50% 38%, ${stops.center} 0%, ${stops.mid} 55%, ${stops.edge} 100%)`;
}

export const FELT_SHADING_FALLBACK_BASE: HslTriplet = parseHslTriplet(FELT_SHADING_FALLBACK_HSL) ?? {
  h: 158,
  s: 30,
  l: 14,
};

export type FeltShadingBase = {
  base: HslTriplet;
  /** Whether to paint a tinted radial fill. False for image-backed felt so the real texture
   *  shows through — only the rail ring + vignette are layered on top of it. */
  showTintedRadial: boolean;
};

/** Picks the base HSL tone (and whether to tint at all) that the radial shading derives from,
 *  given the app's resolved felt background. Pure/testable — no DOM, no rendering. */
export function resolveFeltShadingBase(resolved: ResolvedBackground | undefined): FeltShadingBase {
  if (resolved?.kind === "color") {
    return { base: parseHslTriplet(resolved.color) ?? FELT_SHADING_FALLBACK_BASE, showTintedRadial: true };
  }
  if (resolved?.kind === "gradient") {
    const first = resolved.gradient.colors[0];
    return { base: parseHslTriplet(first) ?? FELT_SHADING_FALLBACK_BASE, showTintedRadial: true };
  }
  if (resolved?.kind === "image") {
    return { base: FELT_SHADING_FALLBACK_BASE, showTintedRadial: false };
  }
  return { base: FELT_SHADING_FALLBACK_BASE, showTintedRadial: true };
}
