# Lessons Page Refactor Plan

## Goals
- Make `apps/client/app/lessons.tsx` data-driven and easy to edit.
- Centralize page copy and button labels behind key-based mapping.
- Render major page sections through descriptor loops instead of manual repeated JSX.
- Separate business/data derivation from template rendering.

## Current Issues
- `lessons.tsx` mixes data-fetching, transformation, sorting, and rendering in one file.
- UI strings and button labels are hardcoded in JSX.
- Section rendering is repetitive (continue, recent, drills, modules, banners).
- Curriculum/business derivation is coupled to the page template.

## Target Structure

### 1. Centralized content/data file
Create `apps/client/app/lessons.data.ts` containing:
- `LESSONS_PAGE_COPY` (headings, labels, helper text, empty/loading strings).
- `LESSONS_BUTTON_KEYS` + `getLessonsButtonLabel(...)` resolver.
- `LESSONS_MODULE_META` for module titles/promises.

### 2. View-model hook
Create `apps/client/app/useLessonsPageViewModel.ts` to hold:
- Catalog fetch + normalization.
- Derived lesson collections (in-progress, recent completed, live drills).
- Module grouping/progress derivation.
- Progress counters + loading/error state.

Return a compact view model consumed by the page template.

### 3. Data-driven rendering
In `lessons.tsx`:
- Build `sectionDescriptors` (`continue`, `recent`, `liveDrills`) and render via `map`.
- Keep module rendering loop but feed from view model + centralized metadata.
- Render status banners (`loading`, `error`) from descriptor arrays.
- Resolve all button text from button key resolver.

## Proposed Data Shapes

```ts
export const LESSONS_BUTTON_KEYS = {
  HERO_CONTINUE: "HERO_CONTINUE",
  HERO_START_FIRST: "HERO_START_FIRST",
  RESUME_STEP: "RESUME_STEP",
  RUN_DRILL: "RUN_DRILL",
  RESUME_DRILL: "RESUME_DRILL",
  START_LESSON: "START_LESSON",
  REVIEW_LESSON: "REVIEW_LESSON",
  LOCKED_LESSON: "LOCKED_LESSON",
} as const;

export const LESSONS_PAGE_COPY = {
  hero: { ... },
  sections: { continue: ..., recentCompleted: ..., liveDrills: ... },
  states: { emptyModules: ..., loadingCatalog: ..., loadFailed: ... },
};
```

## Migration Steps
1. Add `lessons.data.ts` with copy/buttons/module meta.
2. Add `useLessonsPageViewModel.ts` and move fetch/derivations into hook.
3. Update `lessons.tsx` to consume hook + data config.
4. Convert section rendering to descriptor loops.
5. Validate with typecheck.

## Validation Checklist
- Hero progress and CTA still work.
- Continue section and recent-completed section remain independent.
- Live drills and module cards still render and navigate correctly.
- Loading/error banners still appear.
- No copy regressions and no hardcoded button labels in JSX.

## Out of Scope
- API contract changes for lessons list payload.
- Major visual redesign.
