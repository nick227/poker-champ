/**
 * Hero zone layout contract.
 *
 * - This file owns component-internal layout only. Vertical band height
 *   (HERO_ZONE_HEIGHT) lives in table-layout.constants.ts — the shell needs it.
 * - Constants are grouped by region (CONTAINER, CARDS, DEALER_BUTTON, TEXT, STACK)
 *   for quick scanning and visual tweaks.
 * - Each group is Object.freeze({ ... } as const). Names are unprefixed;
 *   the folder provides scope.
 * - For shared primitives (radii, colors), import from ../tokens.
 */

export const CONTAINER = Object.freeze({
  ROW_GAP: 8,
} as const);

export const CARDS = Object.freeze({
  GAP: 10,
  ROW_HEIGHT: 92,
  HOLE_CARDS_COL_PADDING_VERTICAL: 16,
} as const);

export const DEALER_BUTTON = Object.freeze({
  SLOT_SIZE: 24,
} as const);

export const TEXT = Object.freeze({
  HEADER_MIN_HEIGHT: 16,
} as const);
