# Table Constants and Styling Guide

This folder defines table sizing and style tokens with strict ownership rules so developers can style the table without breaking layout.

## Folder Structure

- `table-layout.constants.ts`
  - Global vertical band contracts for the table scene (shell band heights only).
  - Component layout lives in each component folder (e.g. `opponent-strip/layout.ts`, `board-area/layout.ts`).
- `style/*.ts`
  - Visual tokens only (colors, radii).
  - No geometry/layout math.

## How to Style the Table Safely

When styling table UI, decide first what you are changing:

1. Table band height/stacking
- Edit `table-layout.constants.ts`.
- Examples: hero band taller, action bar shorter, opponent strip band size.

2. A component's internal spacing/sizing
- Edit that component's `layout.ts` in its folder (e.g. `board-area/layout.ts`).
- Examples: opponent tile width, community card gap, calc strip height.

3. Visual appearance only
- Edit `style/*.ts` or component class names/styles.
- Examples: border colors, radius, shadows, typography color.

If a change fits more than one category, split it into separate edits.

## Ownership Rules

1. Global contracts (`table-layout.constants.ts`)
- Keep only high-level table bands (top bar, game area, hero zone, action bar). No component-internal values.
- Do not place colors, card scales, paddings, or row internals here.
- Do not export derived totals from this file.

2. Component layout files (each component's `layout.ts`)
- Keep values that describe internals of one component. Do not import layout from other components.
- Prefer explicit numbers over chained formulas when tuning is visual.
- If a value becomes shared by multiple components, promote it to global contract only if it is a true cross-component concept.

3. Style token files (`style/*.ts`)
- Keep only presentation tokens (colors, radii).
- Never place size/layout math in style token files.

## Size Composition Rules

### Contracts declare

Global constants should declare pieces only. Avoid deep composition chains inside constants files.

### Single-consumer values stay local

If a size is used in exactly one file, keep it local to that file (or that component layout file), not global.

Example:

- Dealer bar band detail is local in `table-layout/styles.ts`.
- Community board internals stay in `board-area/layout.ts`.

## Table Layout Invariants

These should remain true after styling changes:

- Vertical layout is fixed bands; only the designated outer container flexes.
- Opponent strip is a horizontal carousel; horizontal overflow/scroll is expected.
- Avoid vertical clipping inside tiles/cards unless intentionally designed.
- Keep `table-layout.constants.ts` focused on high-level bands only.
- Keep global constants declarative.

## Styling Workflow (Recommended)

1. Change one layer only (`tableLayout`, `components`, or `style`).
2. Validate visual fit in the affected section:
- Card rows fit card heights.
- Tile heights fit their internal rows and paddings.
- Action area content is not clipped on short viewports.
3. Run targeted tests:
- `pnpm vitest run src/tests/tableLayout.constants.test.ts` (from `apps/client`; tests shell band heights from `table-layout.constants.ts`).
4. If you changed band heights intentionally, update snapshot expectations.

## Practical Do/Don't

Do:
- Use explicit names: `OPPONENT_CARD_ROW_HEIGHT`, `COMMUNITY_BOARD_HEIGHT`.
- Keep file purpose narrow.
- Tune visual layout with direct values when formula precision adds no practical value.
- Prefer small iterative style changes and verify on the table screen.

Don't:
- Reintroduce `*_BREAKDOWN` objects.
- Mix colors with geometry in the same constants file.
- Export cross-file derived totals from constants.
- Create deep dependency chains between constants files.
- Put one-off styling values into global constants.

## Change Checklist

When adding/changing a size constant:

1. Ask: is this a global band or a component internal?
2. Place it in the narrowest scope that fits.
3. If total/derived math is needed, compute in hook/style/component logic, not global constants.
4. Verify no clipping or overflow regressions in the affected component.
5. Update tests/snapshots when intentional band heights change.
