# AI Execution Checklist: Monorepo Folder Structure Refactor

This document contains the strict, deterministic execution steps for an AI Agent to perform the folder structure migration for `poker-champ`. Do not deviate from these steps without explicit USER authorization. 

**Execution Principle:** Move files via Git, update imports via scripts/codemods, and verify everything before proceeding to the next phase. Treat every phase as a discrete pull request boundary.

---

## ⚡ Phase 0: Pre-Flight Initialization (Read Only)

- [ ] Check out a new branch: `git checkout -b refactor/phase-1-app-boundaries`.
- [ ] Run the initial baseline verification: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`. Do not proceed if the baseline is broken.
- [ ] Read `docs/refactor/ADR-001-folder-structure-refactor.md` to understand context.
- [ ] Read `refactor-blast-radius-analysis.md` to map high-risk areas.

---

## 🚀 Phase 1: App Boundaries & Shared Types

**Goal:** Move root `src/` to `apps/server/src/` and establish `packages/api-types`.

1. **Create Target Structure**
   - [ ] Run `mkdir -p apps/server/src`.
   - [ ] Run `mkdir -p packages/api-types/src`.
   - [ ] Create `apps/server/package.json` (copying relevant dependencies from root).
   - [ ] Create `packages/api-types/package.json` (basic setup).
   - [ ] Add new workspaces to `pnpm-workspace.yaml`.

2. **Update Configurations BEFORE Moving**
   - [ ] Update root `tsconfig.json` paths and `include` arrays to point to `apps/server/src` instead of `src`.
   - [ ] Update root `package.json` scripts (e.g., `build:server`, `test:server`) to CD into `apps/server` or use `pnpm --filter`.
   - [ ] Update CI workflows (`.github/workflows/`) to target `apps/server/src`.
   - [ ] Update Dockerfiles to copy `apps/server` instead of `src`.
   - [ ] Update `vitest.config.ts` and `eslint.config.mjs` path scopes.

3. **Migrate Types**
   - [ ] Move shared types/DTO files via `git mv` from `src/types/` and `src/messages/` to `packages/api-types/src/`.
   - [ ] Execute an IDE workspace search-and-replace or codemod to rewrite relative type imports (e.g., `../../types`) to the new package alias (`@poker-champ/api-types`).

4. **Migrate Server Source**
   - [ ] Move the remaining `src/` folders (excluding `tests/` which will be handled in Phase 2) to `apps/server/src/` via `git mv`.
   - [ ] Ensure `scripts/` that imported from `../src/` are rewritten to import from `../apps/server/src/`.

5. **Checkpoint & Verify Phase 1**
   - [ ] Write `docs/refactor/checkpoints/phase-1-verify.txt` with output of `pnpm -r typecheck` and `pnpm -r test`.
   - [ ] **STOP & REQUEST USER REVIEW** via `notify_user`.

---

## 🚀 Phase 2: Test Co-Location

**Goal:** Move `*.test.ts` files out of the centralized `tests/` directories so they sit adjacent to their source files.

1. **Migrate Server Tests**
   - [ ] Execute script to move `apps/server/src/tests/**/*.test.ts` adjacent to their corresponding source files based on import analysis.
   - [ ] Update all relative imports *inside* the newly moved test files (e.g., `import { TurnManager } from '../src/engine...'` becomes `import { TurnManager } from './TurnManager'`).
   - [ ] Retain true cross-domain integration and E2E tests in a top-level `apps/server/src/tests/integration/` directory.

2. **Migrate Client Tests**
   - [ ] Move `apps/client/src/tests/**/*.test.ts` and scatter `__tests__` folders adjacent to components/features.
   - [ ] Update relative imports inside client tests.

3. **Checkpoint & Verify Phase 2**
   - [ ] Verify `pnpm -r test` natively picks up the co-located tests.
   - [ ] Write `docs/refactor/checkpoints/phase-2-verify.txt`.
   - [ ] **STOP & REQUEST USER REVIEW** via `notify_user`.

---

## 🚀 Phase 3: Domain Flattening & Feature Restructuring

**Goal:** Remove generic `services/` layers and group logic by feature intent.

1. **Flatten Server Domains**
   - [ ] Target `apps/server/src/engine/dealer/services/`.
   - [ ] Move files out of `services/` and group into `dealer/turn/`, `dealer/hand/`, `dealer/settlement/` via `git mv`.
   - [ ] Run global codemod to rewrite imports targeting the flattened paths.

2. **Restructure Client to Features**
   - [ ] Create `apps/client/src/features/`.
   - [ ] Logically move related `components/`, `stores/`, and `hooks/` into scoped feature folders (e.g., `features/table/`, `features/lobby/`).
   - [ ] Run global codemod for client frontend import rewrites.

3. **Database & ORM Extraction**
   - [ ] Create `packages/db`.
   - [ ] Move root `prisma/` folder into `packages/db`.
   - [ ] Create database client export in `packages/db/src/index.ts`.
   - [ ] Update server API to import DB client from `@poker-champ/db`.

4. **Checkpoint & Verify Phase 3**
   - [ ] Run full test suite and typecheck.
   - [ ] Write `docs/refactor/checkpoints/phase-3-verify.txt`.
   - [ ] **STOP & REQUEST USER REVIEW** via `notify_user`.

---

## 🚀 Phase 4: Enforce Boundaries (`index.ts` & Linting)

**Goal:** Prevent future architectural drift.

1. **Establish Public APIs**
   - [ ] Create `index.ts` files at major domain boundaries (e.g., `apps/server/src/engine/dealer/index.ts`, `apps/client/src/features/table/index.ts`).
   - [ ] Re-export only the necessary public classes, types, and hooks.
   - [ ] Refactor cross-domain consumers to only import from the `index.ts` file, removing deep nested path imports.

2. **Configure ESLint Boundary Rules**
   - [ ] Update `eslint.config.mjs` to include strict `no-restricted-imports`.
   - [ ] Ban relative paths crossing the `apps/` or `packages/` boundaries (must use `@poker-champ/*` package aliases).
   - [ ] Ban imports into deep subdirectories of cross-domain features.

3. **Final Verification**
   - [ ] Run `pnpm -r lint` to ensure 0 boundary violations.
   - [ ] Run `dependency-cruiser` to map final architecture graph.
   - [ ] Write `docs/refactor/checkpoints/phase-4-verify.txt` and `STATUS.md = COMPLETE`.
   - [ ] **STOP & REQUEST FINAL USER APPROVAL**.
