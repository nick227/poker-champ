/**
 * Pure sizing logic for the pot's static chip-stack graphic. No React, no game logic — kept
 * pure/testable, mirroring the convention in animations/chipTravel.ts (computeChipCount), but
 * tuned for a resting stack rather than a traveling one: more columns and taller columns for a
 * bigger pot, clamped to a small, cheap-to-render, readable range.
 */

export const POT_STACK_MIN_COLUMNS = 1;
export const POT_STACK_MAX_COLUMNS = 3;
export const POT_STACK_MIN_CHIPS_PER_COLUMN = 2;
export const POT_STACK_MAX_CHIPS_PER_COLUMN = 5;

function potWeight(potCents: number): number {
  if (!Number.isFinite(potCents) || potCents <= 0) return 0;
  return Math.log2(potCents / 100 + 1);
}

/** Number of chip columns (stacks) to render. 0 when there's no pot to show. */
export function computePotStackColumns(potCents: number): number {
  if (!Number.isFinite(potCents) || potCents <= 0) return 0;
  const weight = potWeight(potCents);
  return Math.min(POT_STACK_MAX_COLUMNS, Math.max(POT_STACK_MIN_COLUMNS, Math.floor(weight / 2) + 1));
}

/** Chips stacked per column. 0 when there's no pot to show. */
export function computePotStackHeight(potCents: number): number {
  if (!Number.isFinite(potCents) || potCents <= 0) return 0;
  const weight = potWeight(potCents);
  return Math.min(
    POT_STACK_MAX_CHIPS_PER_COLUMN,
    Math.max(POT_STACK_MIN_CHIPS_PER_COLUMN, POT_STACK_MIN_CHIPS_PER_COLUMN + Math.floor(weight / 3)),
  );
}
