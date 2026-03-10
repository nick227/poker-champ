# Monorepo Folder Refactor: Restructure Summary and Value

Date: 2026-03-09  
Scope: `poker-champ` major folder and boundary refactor (Phases 0-4)

## Executive Summary

The repository was successfully migrated from mixed root-level structure to clear app/package boundaries, with server code moved under `apps/server`, client feature domains under `apps/client/src/features`, and shared contracts consolidated to `packages/realtime-contract`. Architectural boundaries are now enforced with linting, and the refactor is resumable with checkpoints.

This work reduced structural ambiguity, improved ownership and module discoverability, and lowered future migration risk by replacing ad-hoc pathing with explicit boundaries and public APIs.

## What Was Restructured

## 1. App and package boundaries

- Server source moved from root `src/` to `apps/server/src/`.
- Legacy root `src/` was removed after migration.
- Shared contract source of truth aligned to `packages/realtime-contract`.
- Database package formalized under `packages/db` with runtime exports and build output.

## 2. Test layout and reliability

- Unit tests were co-located with source where appropriate.
- Cross-domain/integration test surfaces were retained explicitly.
- Duplicate and stale test artifacts were removed.
- Test type-safety was restored in tsconfig coverage.

## 3. Domain-oriented structure

- Server dealer/service internals were flattened into explicit domain folders (`hand`, `turn`, `settlement`).
- Client moved toward feature-based organization (`features/table`, `features/lobby`, etc.).
- Import rewrites were applied across the repo with codemod/sweep follow-up.

## 4. Public APIs and boundary enforcement

- Public `index.ts` surfaces established at major domain boundaries.
- Cross-domain deep imports were reduced in favor of public entrypoints.
- ESLint `no-restricted-imports` and dependency rules now enforce boundaries.
- Dependency graph checks were integrated via dependency-cruiser.

## Operational hardening completed during refactor

- Runtime package resolution issues were fixed for server start (workspace runtime deps + package exports).
- Build chain was updated to include required workspace package builds.
- Client test environment was stabilized after path migration (mocks, safe import boundaries, replay/test fixes).
- Asset path regressions from moves were corrected.

## Value Delivered

## Architecture and maintainability

- Clear separation of concerns across apps and packages.
- Reduced coupling via public API boundaries.
- Lower cognitive load when navigating server/client/shared code.
- Better long-term fit for parallel team ownership.

## Delivery and reliability

- Refactor completed while preserving green verification gates at phase boundaries.
- Faster and safer restart/recovery due to checkpointed process.
- Reduced chance of silent cross-domain regressions due to boundary lint rules.

## Scalability

- Feature-based client layout supports larger UI/domain growth without deep folder sprawl.
- Explicit package surfaces make future extraction/versioning easier.
- Standardized import paths simplify future codemods and automation.

## Verification Snapshot

Current verified gates:

- PASS: `pnpm server:typecheck`
- PASS: `pnpm -C apps/client typecheck`
- PASS: `pnpm -C apps/client lint`
- PASS: `pnpm exec depcruise --config dependency-cruiser.cjs apps/server/src apps/client/src packages`
- PASS: `pnpm -r lint`

Targeted post-migration suite checks (including replay and money-safety paths) were repaired and validated.

## Notable Decisions

- `packages/realtime-contract` remains canonical for shared client/server realtime contracts.
- `packages/api-types` was not retained as the active source of truth.
- Boundary policy prioritizes domain public APIs over deep internal imports.
- Feature intent was prioritized over naive flattening where domain growth warrants structure.

## Remaining Follow-ups (Non-blocking)

- Continue lightweight lint debt prevention with strict boundary rules kept active.
- Keep docs that still reference legacy `components/domain/*` paths updated over time.
- Add/maintain smoke checks for critical scripts whenever high-churn folders move.

## Closure Recommendation

This refactor can be considered structurally complete and production-ready from a repository organization standpoint. The resulting layout, boundaries, and validation gates materially improve maintainability, onboarding, and change safety for ongoing product delivery.
