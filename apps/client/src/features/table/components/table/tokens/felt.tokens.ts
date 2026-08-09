/**
 * Procedural felt-table visual tokens: oval rail (padded edge), radial shading, and vignette.
 * New file — kept separate from tokens/colors.tokens.ts so it doesn't collide with other agents
 * editing the shared token files in parallel.
 */

/** Rail (padded cushion) color — dark, slightly warm/green so it reads as leatherette, not pure black. */
export const FELT_RAIL_COLOR = "hsl(150, 22%, 7%)";

/** Thin bright seam between rail and felt, like a rail's stitched edge. */
export const FELT_RAIL_SEAM_COLOR = "hsla(43, 55%, 60%, 0.28)";

/** Corner radius + rail thickness, tuned per viewport so the band reads as an oval/rounded table
 *  silhouette without clipping the community-card row (which sits close to the felt's top edge). */
export const FELT_GEOMETRY = Object.freeze({
  /** Large radius so a desktop-sized stage reads as an oval, not a rounded phone band. */
  desktop: { radius: 140, railWidth: 12 },
  compact: { radius: 14, railWidth: 6 },
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
export const FELT_VIGNETTE_OPACITY = 0.4;
