# Poker Client Scaffold v2: Development Pipeline Plan

## Current State (Verified)

- Workspace layout is active:
  - `apps/client` (Expo + Expo Web + Tauri shell)
  - `packages/sdk` (shared contract-first SDK)
  - server contract source in `src/http/openapi.ts`
- SDK is now aligned to OpenAPI:
  - `pnpm sdk:gen` passes
  - `pnpm sdk:check` passes
- UI networking constraint is enforced:
  - `pnpm ui:no-fetch` passes (no direct `fetch(` in UI code)
- App compiles at type level:
  - `pnpm -C apps/client typecheck` passes
- Full gate command:
  - `pnpm verify` passes

## SDK Format and Consumption Contract

- SDK source:
  - `packages/sdk/src/types.gen.ts` (generated from OpenAPI)
  - `packages/sdk/src/endpoints.ts` (typed endpoint groups)
  - `packages/sdk/src/client.ts` (`ApiError` normalization, request core)
  - `packages/sdk/src/context.ts` (`setApiBaseUrl`, `setAuthToken`)
- UI consumption pattern:
  - service layer by verb/entity (`src/services/get/*`, `src/services/post/*`)
  - imports from `@poker-champ/sdk` only
  - standardized error wrapping via `withApiError`

## Target Pipeline (Day-to-Day)

1. Contract update
- Edit `src/http/openapi.ts` first.
- If behavior changes, update route handlers in `src/http/*` and auth/admin routers.

2. Regenerate SDK
- Run `pnpm sdk:gen`.
- Commit `openapi.json` and `packages/sdk/src/types.gen.ts`.

3. Integrate in UI service layer
- Update only service wrappers in `apps/client/src/services/*`.
- Keep screens/stores consuming service layer, not SDK internals directly.

4. Validate local gates
- Run `pnpm verify` before commit.
- Do not run individual checks as your local final gate. `pnpm verify` is the canonical command and must match CI.

5. Build/release lanes
- Web: `pnpm build:web`
- Android: `pnpm build:android`
- iOS: `pnpm build:ios`
- Desktop: `pnpm build:desktop`

## CI/Automation Plan

## Required PR checks

- OpenAPI-first diff guard:
  - if `src/http/openapi.ts` changes, `openapi.json` must change in the same PR/commit range
- breaking-change marker guard:
  - if OpenAPI version changes, require PR label (`breaking`/`breaking-change`) or commit token `BREAKING:`
- `pnpm sdk:gen`
- drift check:
  - `git diff --exit-code -- openapi.json packages/sdk/src/types.gen.ts packages/sdk/src/version.ts`
- `pnpm verify` (canonical CI gate command)

## Workflow ownership

- Contract + SDK checks run on:
  - `src/http/**`
  - `packages/sdk/**`
  - `apps/client/**`
  - root scripts/workflow updates

## Branching and Release Discipline

- Feature branches:
  - `feat/<area>-<summary>` (example: `feat/lobby-table-filters`)
- Commit ordering for API work:
  1. OpenAPI contract
  2. SDK generation
  3. UI/service adaptations
  4. server implementation
- Tag releases when API or SDK breaking changes occur.

## Immediate Backlog (High Priority)

1. Add response-shape assertions in service helpers
- Validate critical payload fields (token, table list, wallet fields) and throw `ApiError` on invariant failure.

2. Add SDK smoke tests
- Cover:
  - auth header injection
  - query serialization
  - path param replacement
  - non-2xx and network error normalization

3. Add API/SDK version mismatch telemetry
- Compare server OpenAPI version with `SDK_VERSION` at app bootstrap and log warning/event on mismatch.

4. Split CI lanes
- fast lane: sdk + typecheck + no-fetch
- full lane: platform build tasks (web/desktop and optionally mobile profiles)

5. Nightly client build smoke (non-blocking)
- schedule runs:
  - `pnpm build:web`
  - `pnpm build:desktop`
- failures are reported but do not block PR merges

## Operating Commands

- Refresh contract artifacts:
  - `pnpm sdk:gen`
- Validate SDK + app + networking policy:
  - `pnpm verify`
- Run client unit tests directly:
  - `pnpm test:client`
- Canonical local pre-push command:
  - `pnpm verify`
- Start app:
  - `pnpm dev`
- Web dev:
  - `pnpm dev:web`
