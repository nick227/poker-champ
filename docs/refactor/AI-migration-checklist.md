# AI Execution Checklist: Monorepo Folder Structure Refactor

This checklist is the canonical execution/recovery guide for the `poker-champ` folder-structure migration.

Last updated: `2026-03-09`
Status: `PHASES 0-4 COMPLETE`

Execution principle: move files via Git, rewrite imports via codemod/search, verify after each phase, and keep the repo resumable at every checkpoint.

---

## Phase 0: Pre-Flight Initialization

- [x] Create a dedicated refactor branch.
- [x] Capture baseline commands and read architecture docs:
  - `docs/refactor/ADR-001-folder-structure-refactor.md`
  - `refactor-blast-radius-analysis.md`

---

## Phase 1: App Boundaries & Shared Contracts

Goal: move root server code into `apps/server/src` and unify shared contracts on `packages/realtime-contract`.

- [x] Target app/workspace structure created for `apps/server`.
- [x] Root configs retargeted before `git mv` operations (`tsconfig`, scripts, CI/workflows, Vitest/ESLint scope).
- [x] Shared type/message surfaces aligned to `@poker-champ/realtime-contract`.
- [x] Server source moved from root `src/` to `apps/server/src`.
- [x] Script imports updated to new server pathing.
- [x] Phase checkpoint recorded in `docs/refactor/checkpoints/phase-1-verify.txt`.

---

## Phase 2: Test Co-Location

Goal: move unit tests beside source while retaining explicit integration test boundaries.

- [x] Server tests co-located with their source files where appropriate.
- [x] Client test structure normalized; duplicate test artifacts removed.
- [x] Cross-domain integration tests retained under top-level test surfaces.
- [x] Type safety for tests restored in root `tsconfig.json`.
- [x] Empty legacy root `src/` removed.
- [x] Phase checkpoint recorded in `docs/refactor/checkpoints/phase-2-verify.txt`.

---

## Phase 3: Domain Flattening & Feature Restructuring

Goal: flatten generic service layers and shift to feature/domain intent.

- [x] Dealer/service hierarchy flattened into explicit domain folders (`turn`, `hand`, `settlement`).
- [x] Client feature-based structure advanced under `apps/client/src/features/*`.
- [x] Import paths rewritten via codemod and follow-up sweep.
- [x] Contract-source decision resolved in favor of `packages/realtime-contract` (no active `api-types` source of truth).
- [x] Phase checkpoint recorded in `docs/refactor/checkpoints/phase-3-verify.txt`.

---

## Phase 4: Boundary Enforcement (`index.ts` + Lint Rules)

Goal: prevent architectural drift through public APIs and enforced import boundaries.

- [x] Public API barrels established at major boundaries (server dealer domain and client feature domains).
- [x] Cross-domain consumers rewired to public surfaces; deep imports reduced.
- [x] ESLint boundary rules (`no-restricted-imports`) tightened for apps/packages boundaries.
- [x] Dependency graph validation completed with `dependency-cruiser`.
- [x] Historical server lint debt burned down to green while preserving boundary enforcement.
- [x] Phase checkpoints recorded:
  - `docs/refactor/checkpoints/phase-4-verify.txt`
  - `docs/refactor/checkpoints/phase-4.md`
  - `docs/refactor/checkpoints/STATUS.md`

---

## Final Gate Snapshot (Current)

- [x] `pnpm server:typecheck`
- [x] `pnpm -C apps/client typecheck`
- [x] `pnpm -C apps/client lint`
- [x] `pnpm exec depcruise --config dependency-cruiser.cjs apps/server/src apps/client/src packages`
- [x] `pnpm -r lint`

---

## Recovery / Resume Commands

If execution is interrupted, resume from a clean state with:

1. `pnpm -r lint && pnpm -r typecheck`
2. `pnpm -r test`
3. `Get-Content -Raw docs/refactor/checkpoints/STATUS.md`

If all pass, continue from the next unstarted item in this checklist.
