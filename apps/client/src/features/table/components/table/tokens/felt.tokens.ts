/**
 * Procedural felt-table visual tokens: oval rail (padded edge), radial shading, and vignette.
 * New file — kept separate from tokens/colors.tokens.ts so it doesn't collide with other agents
 * editing the shared token files in parallel.
 */

/** Rail (padded cushion) mid-tone — warm dark leatherette, not pure black. */
export const FELT_RAIL_COLOR = "hsl(150, 18%, 10%)";

/** Bevel stops for padded rail body (web gradient). */
export const FELT_RAIL_BEVEL_HIGHLIGHT = "hsl(150, 14%, 18%)";
export const FELT_RAIL_BEVEL_SHADOW = "hsl(150, 22%, 5%)";

/** Thin outer ring — muted gold so the oval reads as furniture. */
export const FELT_RAIL_OUTER_RING = "hsla(43, 48%, 42%, 0.55)";

/** Thin bright seam between rail and felt, like a rail's stitched edge. */
export const FELT_RAIL_SEAM_COLOR = "hsla(43, 62%, 58%, 0.42)";

/** Corner radius + rail thickness, tuned per viewport so the band reads as an oval/rounded table
 *  silhouette without clipping the community-card row (which sits close to the felt's top edge). */
export const FELT_GEOMETRY = Object.freeze({
  /** Larger radius so a desktop stage host reads as an oval table, not a phone band. */
  desktop: { radius: 110, railWidth: 22 },
  compact: { radius: 14, railWidth: 7 },
} as const);

export function getFeltGeometry(compact: boolean) {
  return compact ? FELT_GEOMETRY.compact : FELT_GEOMETRY.desktop;
}

/** Lightness deltas (percentage points) applied to the base felt HSL lightness to build the
 *  radial shading stops: brighter center (where the community cards sit), darker toward the rail. */
export const FELT_SHADING_DELTA = Object.freeze({
  center: 9,
  mid: 0,
  edge: -7,
} as const);

/** Fallback base felt HSL triplet ("H S% L%"), matches the app's default felt color. Used when no
 *  resolvable base color is available (e.g. "none" surface). */
export const FELT_SHADING_FALLBACK_HSL = "158 30% 14%";

/** Vignette (corner darkening) opacity — web only; native gets a lighter static approximation. */
export const FELT_VIGNETTE_OPACITY = 0.48;
