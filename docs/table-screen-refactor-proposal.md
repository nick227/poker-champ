# Table Screen Refactor Proposal (`apps/client/app/table/[id].tsx`)

## Goal
Make `apps/client/app/table/[id].tsx` an ultra-light, developer-friendly orchestration layer that is obvious to read in under 2 minutes.

## Current Problem
`[id].tsx` currently mixes too many responsibilities:
- Route/auth/redirect flow
- Table lifecycle (open/close/active table sync)
- Realtime connection wiring
- Voice lifecycle and preference persistence
- Toast/error policies
- Scene switching and rendering
- Top-bar action wiring
- Overlay/modal visibility state

Result: high cognitive load, difficult diffs, and fragile changes when touching unrelated concerns.

## Target State
`[id].tsx` should only do four things:
1. Resolve route params and invoke one composition hook.
2. Render `TableSceneShell` with precomputed props.
3. Render global overlays/modals from precomputed view state.
4. Pass orchestration callbacks from the composition hook.

No business logic, no effect-heavy lifecycle logic, and minimal local state.

## Proposed Architecture

### 1) Add a Single Composition Hook
Create `apps/client/src/components/domain/table/hooks/useTableScreenController.ts` as the one place that composes all table-screen concerns.

The hook returns a stable contract:
- `scene`: loading/auth/connecting/idle/active
- `renderModel`: snapshot/opponents/messages/status/topbar flags/etc.
- `ui`: modal + overlay visibility state
- `actions`: typed handlers for navigation, chat, table actions, voice, rebuy, bot ops

`[id].tsx` consumes this hook and renders only.

Guardrail: `useTableScreenController` must be a composition root, not a god-hook. It should delegate to focused hooks and avoid embedding new side-effect clusters directly.

### 1.1) Define Controller Contract First
Before implementing the hook, define `TableScreenController` type(s) first and treat this as the first deliverable of the controller step.

Define explicit sections:
- `scene`
- `renderModel`
- `uiState`
- `actions`

This contract-first approach prevents output drift and keeps `[id].tsx` usage obvious and stable.

### 2) Split Lifecycle Logic Into Focused Hooks
Move large effect clusters from `[id].tsx` into dedicated hooks:
- `useOpenTableSync` (open/active table + route buy-in persistence)
- `useTableConnection` (room resolution + `useTableRealtime` wiring + table gone behavior)
- `useVoiceControllerLifecycle` (controller creation/teardown + peer sync)
- `useVoiceJoinPolicy` (auto-join when seated, leave when sitting out, mute/toggle, preference storage)
- `useTableToastPolicies` (out-of-chips + table error mapping)

These hooks should be pure orchestration hooks with explicit input/output contracts.

Note on auth redirect: keep inline unless it grows. The current auth redirect logic is small and not a primary complexity driver.

### 3) Move Top-Bar Construction Out of Screen File
Create `apps/client/src/components/domain/table/TableTopBarActions.tsx`:
- Receives a plain props object (`showAddBot`, `addBotPending`, `voiceEnabled`, `voiceMuted`, `chatBadge`, handlers).
- Returns the right-side action cluster.

This removes JSX density from `[id].tsx` and makes top-bar behavior testable.

### 4) Unify Scene Rendering
Use a single scene shell (existing `TableSceneShell.tsx` if suitable, otherwise extend it) to map scene enum -> component:
- `auth_loading`
- `auth_required`
- `connecting`
- `idle`
- `active`

The screen file should avoid inline ternary chains for major scenes.

### 5) Tighten Type Contracts
Define `TableScreenController` type in `apps/client/src/types/tableSceneContract.ts` (or adjacent file):
- Strongly typed actions and render model
- No `any` for voice room/controller in screen-level code
- Explicit nullable fields for scene-specific data

Also type the realtime boundary first:
- Pin down the exact type returned by `onReadyRoom` in `useTableRealtime`.
- Reuse that type in voice hooks instead of widening to `any`.

## Proposed File Responsibilities
- `apps/client/app/table/[id].tsx`
  - Route param read
  - `useTableScreenController(...)`
  - Render shell + overlays
- `apps/client/src/components/domain/table/hooks/useTableScreenController.ts`
  - Composition root for all table-screen hooks
- `apps/client/src/components/domain/table/hooks/useVoiceControllerLifecycle.ts`
  - Voice controller creation/teardown + peer sync
- `apps/client/src/components/domain/table/hooks/useVoiceJoinPolicy.ts`
  - Auto-join/leave, mute/toggle, preference sync and error policy
- `apps/client/src/components/domain/table/hooks/useTableConnection.ts`
  - Realtime wiring + table gone handling
- `apps/client/src/components/domain/table/TableTopBarActions.tsx`
  - Top-bar buttons/status dot cluster

## Refactor Sequence (Low Risk)
1. Extract `TableTopBarActions` with no behavior changes.
2. Type `useTableRealtime` `onReadyRoom` boundary and remove `any` usage for voice room.
3. Extract `useVoiceControllerLifecycle`.
4. Extract `useVoiceJoinPolicy`.
5. Extract `useTableConnection` and `useOpenTableSync`.
6. Define `TableScreenController` contract type(s) explicitly.
7. Introduce `useTableScreenController` as composition layer.
8. Collapse `[id].tsx` to pure orchestration render.
9. Replace ternary scene chain with `TableSceneShell` mapping.

Keep behavior stable at every step; ship in small PRs.

## Acceptance Criteria
- `[id].tsx` under ~150 lines, mostly render + controller hookup.
- Max 2 `useEffect` blocks in `[id].tsx` (ideally 0).
- No `useMemo`/`useCallback` for domain logic in `[id].tsx`.
- Voice/realtime/toast policies fully outside `[id].tsx`.
- Scene rendering path is obvious from top-to-bottom without scrolling.

## Testing Plan
- Add/adjust hook tests:
  - `useVoiceControllerLifecycle` (controller create/teardown, peers sync)
  - `useVoiceJoinPolicy` (auto-join, leave-on-sit-out, mute toggle, permission denial handling)
  - `useTableConnection` (room selection + table gone flow)
  - `useOpenTableSync` (open/active/route buy-in behavior)
- Keep existing scene orchestration tests (`tableScene.orchestration.test.ts`) aligned with new controller contract.
- Add one light render test for `[id].tsx` wiring only if low maintenance.
- Enforce structural invariants with durable checks:
  - ESLint rule or custom lint check for max hooks/effects in `[id].tsx`
  - PR checklist item: no domain side effects added back into `[id].tsx`

## Non-Goals
- No UI redesign.
- No table gameplay logic changes.
- No lobby flow changes.

## Definition of Done
- `[id].tsx` is an obvious orchestration layer.
- Behavior parity verified by existing + new tests.
- Future feature changes can be implemented by editing one focused hook or one presentational component, not the route file.
