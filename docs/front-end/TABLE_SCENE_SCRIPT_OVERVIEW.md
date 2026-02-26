# Table Scene Script Overview

This document explains the current table scene structure and how the files orchestrate together.

## Current structure

- `apps/client/app/table/[id].tsx`
- `apps/client/app/table/TablePage.tsx`
- `apps/client/app/table/TableSceneRouter.tsx`
- `apps/client/src/components/domain/table/views/ActiveTableView.tsx`
- `apps/client/src/components/domain/table/views/EmptyTableView.tsx`
- `apps/client/src/components/domain/table/views/StatusTableView.tsx`
- `apps/client/src/components/domain/table/views/tableView.shared.tsx`
- `apps/client/src/components/domain/table/shell/TableSceneShell.tsx`
- `apps/client/src/components/domain/table/shell/TableLayoutHeightContext.tsx`
- `apps/client/src/components/domain/table/model/useTableSceneModel.ts`

## File responsibilities

## 1) `[id].tsx` (route entry)

- Expo route file for `/table/[id]`.
- Delegates rendering to `TablePage`.

## 2) `TablePage.tsx` (page coordinator)

- Reads route params (`id`, `buyInCents`).
- Builds controller state via `useTablePageController`.
- Renders:
  - `TableSceneRouter` (main table scene)
  - `TablePageOverlays` (sheets/popups)
  - `BottomBar` (global nav)

## 3) `TableSceneRouter.tsx` (mode switch)

- Switches by `scene.mode`:
  - `auth_loading`, `auth_required`, `connecting` -> `StatusTableView`
  - `idle` -> `EmptyTableView`
  - `active` -> `ActiveTableView`
- Hosts share-link and empty-opponent state wiring.

## 4) `views/StatusTableView.tsx`

- Renders auth/connecting states in shared shell.
- Owns non-game status messaging and CTA button behavior.

## 5) `views/EmptyTableView.tsx`

- Renders idle/pre-hand state.
- Uses `useTableSceneModel` for shared display model.
- Injects non-interactive hero/bottom content into `TableSceneShell`.

## 6) `views/ActiveTableView.tsx`

- Renders active gameplay state.
- Uses `useTableSceneModel` and emits hand/board sound events.
- Injects dealer bar, board, hero, and action/rebuy bottom content into `TableSceneShell`.

## 7) `views/tableView.shared.tsx`

- Shared helper for idle/active views.
- Resolves final scene model (`sceneModel` override vs computed model).
- Builds shared shell props and community-board node.

## 8) `shell/TableSceneShell.tsx`

- Shared visual frame/chrome for all table scene modes:
  - top bar
  - opponent strip
  - game area
  - hero section
  - bottom action section
- Applies theme vars and safe-area layout.
- Provides `heroZoneHeight` via `TableLayoutHeightProvider`.

## 9) `shell/TableLayoutHeightContext.tsx`

- Minimal context for sharing `heroZoneHeight`.

## 10) `model/useTableSceneModel.ts`

- Builds the normalized table scene model used by idle/active views.

## Runtime flow

1. User opens `/table/[id]`.
2. `[id].tsx` renders `TablePage`.
3. `TablePage` builds controller and renders `TableSceneRouter`.
4. `TableSceneRouter` selects view by `scene.mode`.
5. Selected view composes content into `TableSceneShell`.
6. `TableSceneShell` renders stable chrome and provides height context.

## Clean mental model

```text
/table
  +-- TablePage.tsx            (route entry coordinator)
  +-- TableSceneRouter.tsx     (mode switch)
  +-- views/
  |     +-- ActiveTableView.tsx
  |     +-- EmptyTableView.tsx
  |     +-- StatusTableView.tsx
  |     +-- tableView.shared.tsx
  +-- shell/
  |     +-- TableSceneShell.tsx
  |     +-- TableLayoutHeightContext.tsx
  +-- model/
        +-- useTableSceneModel.ts
```

## Migration status

Completed:

- Route/page split introduced (`[id].tsx` -> `TablePage.tsx`).
- Mode router renamed and promoted (`TableSceneRouter.tsx`).
- View/shell/model implementations moved to target folders.
- Legacy compatibility shims removed.
- Shared idle/active shell composition extracted.

Remaining refactor ideas:

- Add a focused test checklist for all router modes.

