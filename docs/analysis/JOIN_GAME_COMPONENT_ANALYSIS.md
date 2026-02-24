# Join-Game UI Analysis (Post-Refactor)

## Scope
This document describes the current join-game table architecture after consolidation work.

## Current Architecture

### Orchestrator: `apps/client/app/table/[id].tsx`
Owns:
- auth hydration and login redirect
- realtime connection (`useTableRealtime`)
- snapshot subscription via stores
- mode decision (`!hasSnapshot`, `!hasActiveHand`, active)
- top-bar action composition (idle/active variants)
- chat visibility + unread tracking
- player popup visibility
- table close/delete behavior
- rebuy modal ownership (`ChooseTableModal`)
- action dispatch (`sendAction`)

### Presentational: `apps/client/src/components/domain/table/TableLayout.tsx`
Owns:
- active-hand visual layout only
- uses derived snapshot state (`useTableSnapshot`)
- accepts callbacks/slots via props
- no store subscriptions for app/business state

### Presentational: `apps/client/src/components/domain/table/EmptyTableView.tsx`
Owns:
- idle/no-active-hand visual layout only
- accepts `canRebuy` and `onPressRebuy`
- no modal ownership
- no store subscriptions for app/business state

### Shared Shell: `apps/client/src/components/domain/table/TableSceneShell.tsx`
Owns common table structure for both active and idle modes:
- title band
- top bar band
- opponent strip
- dealer bar slot
- board slot
- hero slot
- bottom slot

## What Was Removed
- Deleted: `apps/client/src/components/domain/table/TableLayoutProvider.tsx`
- Result: no second orchestrator between route and layouts.

## Lifecycle (Current)
1. No auth hydration -> loading fallback.
2. No auth token -> redirect UI.
3. `!hasSnapshot` -> connecting shell + top bar.
4. `hasSnapshot && !hasActiveHand` -> `EmptyTableView`.
5. `hasSnapshot && hasActiveHand` -> `TableLayout`.

Overlays (`ChatOverlay`, `PlayerHistoryPopup`, `ChooseTableModal`) remain route-owned and survive mode switches.

## Ownership Check (Current)

### Route ownership duplication
- Removed. Route is now single owner for chrome + overlays + orchestration.

### Top bar owner
- Route composes top-right actions once per mode and passes down.

### Rebuy modal owner
- Route owns `ChooseTableModal`.
- `EmptyTableView` only triggers via callback.

### Snapshot source of truth
- Unchanged: `apps/client/src/stores/table.store.ts` (`snapshotsByTableId`).
- Realtime -> registry -> store write path remains single-source.

## Replay Compatibility
`TableLayout` remains reusable with provider-shaped inputs (`snapshot`, `onAction`, plus optional chrome props), and shared shell reduces branching differences across modes.

## Residual Risks / Follow-ups
1. `TableLayout` and `EmptyTableView` still derive some snapshot UI fields independently (`useTableSnapshot` vs direct adapter calls in idle). This is acceptable but can be unified further if desired.
2. If replay mode needs identical chrome behavior, keep route-level composition path reusable (or extract into a small scene hook).

## Summary
- Single orchestrator achieved.
- Shared shell extracted.
- Rebuy modal moved out of presentational idle view.
- Provider-layer split ownership removed.
- Architecture now matches the intended boundaries.

## Guardrail Convention
- `storeRegistry` access stays at route/container layer only (`app/*` and orchestration hooks).
- Enforced by lint for `src/components/domain/table/**/*.{ts,tsx}`: no imports from `@/registry/store.registry`.
- Components under `src/components/domain/table/*` receive data via props/scene contract.
