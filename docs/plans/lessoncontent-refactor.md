# LessonContent Refactor Plan

## Goals
- Make lesson UI copy, button labels, and section structure centralized and easy to edit.
- Convert repeated JSX blocks into data-driven loops for section titles, headings, metadata rows, and buttons.
- Separate business/state logic from template rendering concerns.
- Keep existing behavior and navigation flow unchanged.

## Current Pain Points
- `LessonContent.tsx` mixes state orchestration with a large amount of static UI copy.
- Button labels are hardcoded inline and spread across multiple render branches.
- Repeated UI patterns (status cards, section cards, metadata rows, action buttons) are rendered manually.
- Content edits currently require touching business-heavy component code.

## Target Architecture

### 1. Centralized data object
Create `lessonContent.data.ts` with:
- Copy dictionary (`title`, `labels`, helper text, status messages).
- Button key map (`BACK_TO_BOOTCAMP`, `NEXT`, `RETRY`, etc.).
- Button label resolver to support dynamic labels from context (e.g., boot camp completion state, custom apply CTA text).

### 2. Data-driven rendering in `LessonContent.tsx`
Use arrays of descriptors and `map` loops for:
- Completion view cards/sections (score, disciplines, related links).
- Header metadata rows/chips.
- Related links.
- Navigation/action buttons.
- Repeated state notices (disabled, loading, unavailable).

### 3. Business logic/template separation
- Keep runtime/session behavior in hooks/callbacks (`useLessonSession`, action handlers, advancing logic).
- Keep display text and button-label decisions in centralized data/resolver.
- Keep JSX focused on rendering descriptor arrays.

## Proposed Data Shapes

```ts
export const LESSON_CONTENT_BUTTON_KEYS = {
  APPLY_AT_TABLE: "APPLY_AT_TABLE",
  BACK_TO_BOOTCAMP: "BACK_TO_BOOTCAMP",
  CONTINUE_ADVANCED_DRILLS: "CONTINUE_ADVANCED_DRILLS",
  RETRY: "RETRY",
  PREV: "PREV",
  NEXT: "NEXT",
  MINIMIZE: "MINIMIZE",
  SHOW_LESSON: "SHOW_LESSON",
  READ_BLOG_POST: "READ_BLOG_POST",
  REPLAY_HAND: "REPLAY_HAND",
} as const;

export const LESSON_CONTENT_COPY = {
  stateMessages: {
    disabled: "Poker School is disabled.",
    loading: "Loading lesson...",
    unavailable: "Lesson unavailable.",
    snapshotUnavailable: "Lesson snapshot unavailable.",
  },
  // ...labels/headings/helper text
};

export function getLessonButtonLabel(key, context?): string;
```

## Migration Steps
1. Add `lessonContent.data.ts` with copy + button keys + resolvers.
2. Replace hardcoded button labels in `LessonContent.tsx` with key-driven resolution.
3. Refactor completion and lesson-sheet sections into descriptor arrays rendered by loops.
4. Consolidate repeated state fallbacks into a single keyed renderer.
5. Verify behavior manually and with project checks.

## Validation Checklist
- Completion screen shows same dynamic data and buttons as before.
- Next/Prev/Retry behavior unchanged.
- Minimize/expand sheet behavior unchanged.
- Related links still route correctly.
- No copy regressions for loading/error/unavailable states.

## Risks and Mitigations
- Risk: subtle conditional rendering regressions.
  - Mitigation: keep descriptor `visible` predicates explicit and close to existing conditions.
- Risk: overly abstract config that is hard to read.
  - Mitigation: keep data object flat, typed, and focused on copy + labels only.

## Out of Scope
- Refactoring `LessonInstructorPanel` and `LessonQuestionPanel` in this pass.
- API/schema changes for lesson data from backend.
