# Button Strategy and Implementation Plan (NativeWind)

## Purpose
Establish one button system for the mobile app so actions are consistent, token-driven, and easy to maintain.

Primary reference: [ui-surface-inventory.md](../ui-surface-inventory.md)

## Scope
This plan covers these product areas:
- Lobby
- Learn (Lessons)
- Board (Leaderboard)
- Settings
- Table

Assumption: "board" maps to `/leaderboard` in current routes.

## Current State Summary

### What is working
- Color, spacing, and radius tokens are centralized in `apps/client/src/theme/tokens.css` and exposed through `apps/client/tailwind.config.cjs`.
- Shared utility classes already exist (`ui-touch`, `ui-surface`, `ui-stack-*`, etc.).
- Base button components exist and are reused in many places.

### What is fragmented
- `Pressable` is still used directly in many feature files for tap targets, menu items, filters, chips, and row actions.
- Button semantics are mixed with layout concerns (`className` passed into base `Button` and reused on both wrapper and inner `View`).
- Pill controls are implemented in multiple shapes without a single taxonomy (filters, chips, quick actions, menu rows).
- Pressed/disabled behavior is inconsistent between shared components and ad-hoc `Pressable`s.

## Current Custom Controls Inventory

### Shared controls in use now
- `Button` (`primary`, `ghost`, `danger`, `link`)
- `ChipButton` (selected/unselected segmented chip)
- `ConfirmButton` (join-table CTA style)
- `IconButton` (icon-only action with optional badge)

### Ad-hoc controls currently acting like buttons
- `Pressable` list rows/cards
- `Pressable` text links (inline actions)
- `Pressable` modal/menu rows
- `Pressable` icon-like controls (close, dismiss, minimize)
- `Surface` rendered as `Pressable` in lessons cards

## Location + Activity Inventory

## Lobby
- Discover/Sort/Create: `GameListHeader` uses `Button`.
- Fast entry: `InstantGamePanels`, `ReplayQuickLinks` use full-width `Button` CTAs.
- Join flow: `ConfirmButton` in `GamePanelPrimaryLine`.
- Row interaction: `GameTablePanel` wraps card in `Pressable` for quick join.
- Destructive action: table delete in `GamePanelFooter` uses ad-hoc `Pressable` icon.
- Modal forms: `CreateGameModal` and `ChooseTableModal` use `ChipButton` + `Button`.
- Notice dismissal: `app/lobby.tsx` has ad-hoc `Pressable` ("Dismiss").

## Learn
- Hero/start/resume actions: `Button` in `lessons.components.tsx`.
- Lesson cards: `Surface as Pressable` for row-level navigation.
- Lesson runtime controls: `Button` for nav/retry/continue.
- Inline utility actions: ad-hoc `Pressable` for related links, sheet minimize/expand.
- MCQ options: `Button` acting as selectable options.

## Board (Leaderboard)
- Category filters: ad-hoc `Pressable` rounded pills in `app/leaderboard.tsx`.
- Recovery action: `Button` Retry for error state.

## Settings
- Account actions: `Button` for deposit, logout, avatar change/remove.
- Additional pressables likely inside nested components (e.g., avatar wrappers), but primary page actions use shared `Button`.

## Table
- Core gameplay actions: `ActionBar` uses `Button` + `ChipButton`.
- Top navigation: `IconButton` trigger + ad-hoc `Pressable` menu items.
- Opponent tile tap: `Pressable` rows in `OpponentStrip`.
- Dropdown/sheets: many ad-hoc `Pressable` items in `ActiveTablesDropdown`, `ThemePickerSheet`.
- Utility copy/share links: `Pressable` text link in `TableSceneRouter`.

## Target Button Taxonomy
We will standardize on 4 button types (intent) with 3 pill sizes and icon style.

## 1) Intents (4 types)
- `primary`: main forward action (start, apply, continue, join).
- `secondary`: supporting action (sort, back, optional path).
- `neutral`: low-emphasis action (filters, utility, inline options).
- `danger`: destructive action (delete, leave, logout).

## 2) Shapes
- `pill`: default shape for most text buttons.
- `icon`: square/circle icon-only button.
- `row`: full-width row action (for menu/list style controls).

## 3) Sizes (pill variations)
- `pill-sm`: compact contexts (dense toolbars, chips).
- `pill-md`: default app size (recommended baseline).
- `pill-lg`: prominent CTA size.

## 4) State model (all buttons)
- `default`
- `pressed`
- `disabled`
- `loading`
- `selected` (for segmented/filter behavior)

## NativeWind Strategy

### A) Add button utility classes in `tailwind.config.cjs`
Add a dedicated `btn-*` namespace via plugin components.

Core examples:
- `.btn` (base interaction + alignment + min touch target)
- `.btn-pill-sm`, `.btn-pill-md`, `.btn-pill-lg`
- `.btn-icon-sm`, `.btn-icon-md`, `.btn-icon-lg`
- `.btn-row`
- `.btn-primary`, `.btn-secondary`, `.btn-neutral`, `.btn-danger`
- `.btn-selected` (for filter/segmented selected state)
- `.btn-label-*` if typography normalization is needed

Keep existing `ui-*` classes; `btn-*` is action-specific and layered on top.

### B) Build one canonical button primitive
Create a new base primitive (or evolve existing `Button`) with explicit props:
- `intent`: `primary | secondary | neutral | danger`
- `shape`: `pill | icon | row`
- `size`: `sm | md | lg`
- `selected?: boolean`
- `loading?: boolean`
- `leftIcon?`, `rightIcon?`

Implementation goals:
- Keep sound + press opacity in one place.
- Keep touch target guarantees (`>=44px`) in one place.
- Generate classes from intent/shape/size map instead of per-feature strings.

### C) Keep specialized wrappers, but make them thin
- `ChipButton`, `ConfirmButton`, `IconButton` become wrappers over the canonical primitive.
- Remove unique style logic from wrappers unless behavior is truly unique.

## Location + Activity Mapping to Target Types

## Lobby
- Create/Start/Join/Apply: `primary pill-md/lg`
- Sort/Cancel: `secondary pill-md`
- Filter chips (blinds/seats/visibility): `neutral pill-sm` + `selected`
- Delete table: `danger icon-md`
- Dismiss nudge: `neutral row` or `neutral pill-sm` (choose one and standardize)

## Learn
- Start/Continue/Next: `primary pill-md/lg`
- Back/Retry/Secondary nav: `secondary pill-md`
- MCQ options: `neutral pill-md` + `selected` for chosen option
- Sheet controls (minimize/show): `neutral pill-sm`
- Lesson card tap surfaces remain row actions, but button-like controls should use canonical primitive

## Board (Leaderboard)
- Category chips: `neutral pill-sm` + `selected`
- Retry: `secondary pill-md`

## Settings
- Deposit/change photo: `secondary pill-md`
- Logout/remove avatar/delete-like actions: `danger pill-md`

## Table
- Fold: `danger pill-md`
- Check/Call: `secondary pill-md`
- Bet/Raise/Join/Rebuy: `primary pill-md`
- Quick bet chips (MIN/HALF/POT/ALL-IN): `neutral pill-sm` (selected where relevant)
- Top menu trigger: `neutral icon-md`
- Top menu items: `neutral row` (danger row for leave table)
- Theme/felt/card pickers: `neutral pill-sm` or `neutral row` depending on density

## Implementation Phases

## Phase 0: Inventory baseline (done by this doc)
Deliverables:
- Control inventory by area/activity
- Shared taxonomy agreement

## Phase 1: Token + class foundation
Files:
- `apps/client/tailwind.config.cjs`
- optional: `apps/client/src/theme/tokens.css` (if additional button tokens are needed)

Tasks:
- Add `btn-*` utilities.
- Define intent + size class maps.
- Keep backward compatibility with existing `ui-*` utilities.

## Phase 2: Canonical primitive and wrappers
Files:
- `apps/client/src/components/base/Button.tsx`
- `apps/client/src/components/base/ChipButton.tsx`
- `apps/client/src/components/base/ConfirmButton.tsx`
- `apps/client/src/components/base/IconButton.tsx`

Tasks:
- Implement intent/shape/size API.
- Keep press feedback and disabled/loading behavior centralized.
- Refactor wrappers to delegate to canonical primitive.

## Phase 3: Migrate by location
Order:
1. Lobby (highest visible inconsistency and flow-critical CTAs)
2. Table (high frequency interactions)
3. Learn (many card and runtime controls)
4. Board
5. Settings

Migration targets (first pass):
- `apps/client/app/lobby.tsx`
- `apps/client/src/components/domain/lobby/*`
- `apps/client/src/components/domain/table/*`
- `apps/client/src/features/table-page/TableSceneRouter.tsx`
- `apps/client/app/leaderboard.tsx`
- `apps/client/app/settings.tsx`
- `apps/client/src/components/domain/settings/ProfileAvatarSection.tsx`
- `apps/client/app/lessons.components.tsx`
- `apps/client/src/features/lessons/LessonContent.tsx`

## Phase 4: Cleanup + governance
Tasks:
- Remove ad-hoc button classes where canonical classes exist.
- Add lint/search guardrails to catch new ad-hoc `Pressable` button styles.
- Update docs:
  - `docs/reference/COMPONENTS.md`
  - `docs/guides/UI_DEVELOPER_GUIDE.md`

## Definition of Done
- Every button-like action in scope routes maps to an explicit `intent + shape + size`.
- No new ad-hoc button color/padding classes outside `btn-*` or canonical components.
- Core button states (`pressed`, `disabled`, `loading`, `selected`) are consistent across Lobby, Learn, Board, Settings, Table.
- `ChipButton`, `ConfirmButton`, `IconButton` are thin wrappers (or removed if redundant).

## Risks and Mitigations
- Risk: migration churn from broad `Pressable` usage.
  - Mitigation: migrate by location and keep wrappers backward-compatible until final cleanup.
- Risk: visual regression in dense table UI.
  - Mitigation: start with `pill-md` baseline and explicitly test `ActionBar`, top nav menu, and pickers.
- Risk: semantic mismatch between row-tap surfaces and buttons.
  - Mitigation: keep row-level card navigation separate from button primitive; only convert true actions.

## Next Execution Task (recommended)
Create `btn-*` classes and refactor `Button.tsx` to intent/shape/size first, then migrate Lobby completely before touching other areas.
