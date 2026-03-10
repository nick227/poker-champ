# Codebase Folder Structure Refactor Recommendations

After reviewing the current structure of the `poker-champ` codebase, several inconsistencies and opportunities for improvement have been identified. The project currently exhibits a hybrid structure—it uses `apps/` and `packages/` typical of a monorepo, but also maintains a giant `src/` folder at the root level, likely serving as the backend api/engine. Additionally, there are scattered testing strategies and unnecessary nesting in domain folders.

Here are the specific recommendations for refactoring the folder structure:

## Priority 1: Monorepo Consistency (Move Root `src/`)

**Current State:**
The project root contains `apps/client` (the frontend) and `packages/` (shared code like `sdk` and `realtime-contract`). However, the backend server/engine code sits directly in a root `src/` directory.

**Recommendation:**
To fully embrace the monorepo architecture and clarify boundaries, move the root `src/` into the `apps/` directory.
- `src/` -> `apps/server/src/` (or `apps/api/src/` / `apps/engine/src/`)

This ensures that all runnable applications live in `apps/` and all shared libraries live in `packages/`. It also prevents tooling (like ESLint or TypeScript) from confusing root-level backend code with shared workspace code.

## Priority 2: Co-locate Tests with Source Code

**Current State:**
Test files are fragmented and follow multiple inconsistent conventions:
- The backend has a massive centralized `src/tests/` folder with over 80 test files, completely detached from the code they test.
- The frontend (`apps/client/src/`) splits tests between a centralized `tests/` folder (50+ files) and inline `__tests__/` folders (e.g., `stores/__tests__/`, `components/.../__tests__/`).

**Recommendation:**
Adopt a consistent **co-location** strategy for unit tests across the entire monorepo. 
- Move `*.test.ts` files to sit exactly next to the files they test.
  - E.g., `src/engine/dealer/services/TurnManager.ts` should have `src/engine/dealer/services/TurnManager.test.ts` right next to it.
- **Exception for Integration/E2E:** Keep a small top-level `tests/` directory only for cross-module integration tests or end-to-end tests that don't belong to a single file.
- **Why?** Co-location dramatically improves discoverability. When a developer modifies a file, the test is immediately visible. It also makes moving, renaming, or deleting features much safer, as the tests naturally travel with the source file.

## Priority 3: Eliminate Redundant Layers (e.g., `services/`)

**Current State:**
There is unnecessary nesting that artificially inflates import paths and hides domain logic. The prime example is `src/engine/dealer/services/`, which contains 12 core domain files (`TurnManager.ts`, `ActionService.ts`, `HandLifecycleService.ts`). 

**Recommendation:**
Remove generic container folders like `services/`, `utils/`, or `helpers/` when they sit inside a specific cohesive domain (like `dealer`). 
- Flatten `src/engine/dealer/services/*` directly into `src/engine/dealer/`.
- **Important Caveat:** While flattening `services/` is good now, if a folder grows quickly, feature subfolders are better than a totally flat directory. Group files by **domain intent and feature** (e.g., `src/engine/dealer/lifecycle/`, `src/engine/dealer/turn/`, `src/engine/dealer/hand/`) instead of technical role.
- **Why?** "Services" is a generic technical term that doesn't describe the business domain. Dropping these folders reduces boilerplate and makes the structure scale functionally.

## Priority 4: Establish "Public APIs" with `index.ts`

**Recommendation:**
As directories like `src/engine/dealer/` or its sub-features are flattened/restructured, introduce `index.ts` files at domain boundaries to explicitly export public-facing logic.
- **Why?** This defines a clear "Public API" for the domain, preventing consumers from making "deep imports" into internal logic. It makes future refactoring easier by decoupling the internal file structure of a domain from its external consumers.

## Priority 5: Use `packages/realtime-contract` as Contract Source of Truth

**Recommendation:**
Use `packages/realtime-contract` as the single shared contract package for frontend/backend message and DTO schemas.
- **Why?** This ensures that changes to core poker logic, models, or message shapes are immediately and safely reflected in both the server and client, reducing runtime boundary errors and "out of sync" type definitions.

## Priority 6: Move from Layer-Based to Feature-Based Client Structure

**Recommendation:**
While moving toward monorepo consistency, prioritize organizing the frontend by **domain feature** (e.g., `features/table/`, `features/lobby/`, `features/hand-replay/`) rather than technical role (`components/`, `hooks/`, `stores/`).
- **Why?** Everything needed to understand or modify a feature (its UI, state management, utility hooks, and tests) lives in one place, significantly reducing "context switching" when working on a specific part of the app.

## Priority 7: Automated Enforcement via Linter Rules

**Recommendation:**
Once the refactor is complete, add strict ESLint rules (such as `no-restricted-imports`) to prevent "architectural drift."
- Enforce that apps cannot import internal files from other apps.
- Enforce that shared code is only imported from `packages/*`.
- **Why?** This programmatically prevents developers from re-creating generic `services/` folders or reaching deep into other domains' internal structures moving forward.

## Priority 8: Database Layer Ownership (Prisma)

**Recommendation:**
Move the `prisma/` directory and related database logic out of the root.
- **Move `prisma/` -> `packages/db/`**: This allows the Prisma client and migrations to be easily shared between `apps/server`, administrative tools, or future microservices (e.g., a background worker).
- **Why?** Centralizing the data layer in a dedicated package prevents the server app from becoming a "monolith" that other apps must reach into just to get a database client.

## Priority 9: Script Orchestration & Domain-Specific Tools

**Current State:**
The root `scripts/` directory is a "junk drawer" containing everything from DB backfills and server management to frontend asset generation (card faces) and lesson content processing.

**Recommendation:**
Categorize and move scripts to their relevant contexts:
- **Server/Admin Scripts:** (e.g., `make-admin.js`, `backfill-starting-bankroll.ts`) -> `apps/server/scripts/`.
- **Asset/Frontend Scripts:** (e.g., `generate-card-face-packs.ts`) -> `apps/client/scripts/` or `packages/assets/`.
- **Lesson Management:** (e.g., `build-all-lessons-from-specs.ts`) -> `packages/lessons-engine/scripts/` (see Priority 10).
- **Tooling/Orchestration:** Keep only true "project-wide" scripts in the root (e.g., `build-all.mjs`).

## Priority 10: Shared Logic & Content (Lessons & Money)

**Recommendation:**
Extract core "business rule" logic that is needed by both the client (for optimistic UI/validation) and the server (for authority).
- **`src/lessons/` -> `packages/lessons-engine`**: This should contain the grading logic and lesson state machines so the client can give instant feedback without a round-trip to the server.
- **`content/lessons/` -> `packages/content-lessons`**: Move static lesson data to a versioned package.
- **Money Safety Invariants**: If the client needs to calculate pot odds or validate bets for UI hints, move the math logic from `src/engine` to a `packages/poker-math`.


## Summary of Proposed Target Structure

```text
poker-champ/
├── apps/
│   ├── client/
│   │   └── src/
│   │       ├── features/          <-- (Feature-based structure)
│   │       │   ├── table/
│   │       │   └── lobby/
│   │       └── ... 
│   └── server/                    <-- (Moved from root src/)
│       ├── prisma/                <-- (If server-only, otherwise packages/db)
│       ├── scripts/               <-- (Server-specific admin/ops)
│       └── src/
│           ├── engine/
│           ├── http/
│           └── tests/             <-- (Integration only)
├── packages/
│   ├── db/                        <-- (Shared Prisma client/migrations)
│   ├── lessons-engine/            <-- (Shared grading/state logic)
│   ├── poker-math/                <-- (Shared stack/pot/odds logic)
│   ├── realtime-contract/         <-- (Shared contracts source of truth)
│   └── sdk/
└── package.json
```

## Migration Plan & Phased Rollout

To limit breakage, this refactor should not be a single massive PR. Execute this in strictly green-CI phases:

**Phase 1: App Boundaries & Shared Contracts**
1. **ADR:** Write a short Architecture Decision Record (ADR) or checklist so the team follows this convention going forward.
2. Initialize `apps/server` (or `apps/engine`) and its `package.json`. Move the root `src/` directory into it. 
3. **Important:** Add/update project references and aliases (`tsconfig.json`, Jest/Vitest, ESLint, bundler) **before** moving files to avoid import chaos.
4. Extract shared types into `packages/realtime-contract`. Wait for CI green.

**Phase 2: Test Co-location**
1. Run a migration script to automatically move `tests/**/*.test.ts` files (unit tests) to their corresponding source directories based on import statements or filename matching.
2. Retain integration/e2e tests in a top-level `apps/server/src/tests/` directory. Wait for CI green.

**Phase 3: Deep Folder Flattening & Feature Restructuring**
1. Use codemods and path rewrite scripts for imports. Enforce **no manual bulk renames** to minimize human error.
2. Flatten `services/` directories and group by feature/intent (e.g., `dealer/turn/`) on the server.
3. Migrate client structure towards `features/`. Wait for CI green.

**Phase 4: Enforcement**
1. Add strict ESLint boundaries (`no-restricted-imports`) and `index.ts` public APIs to cement the architecture.

## Pre-flight Checklist (Before Execution)

1. Normalize this document and related configs to UTF-8 to avoid mojibake (for example, `â”...` characters in tree diagrams).
2. Define phase exit criteria and require all of them before merge:
   - TypeScript compile errors: `0`
   - Broken imports: `0`
   - Test suite: passing
   - Boundary-rule violations: `0`
3. Confirm test taxonomy and naming conventions:
   - Unit tests: co-located (`*.test.ts`, `*.test.tsx`)
   - Integration tests: `apps/*/src/tests/`
   - E2E tests: `apps/*/e2e/`
4. Require rollback readiness for each phase:
   - One PR per phase
   - Codemod dry-run output included in PR description
   - Fast revert path documented if CI fails
5. Add dependency-boundary checks in CI (in addition to ESLint), using `dependency-cruiser` or `madge`, to detect cross-app and deep-import regressions.
6. Define `index.ts` boundary policy:
   - Consumers import only from public `index.ts` boundaries
   - Deep imports into internal module files are disallowed
7. Define ownership and versioning for `packages/realtime-contract`:
   - Assign package owners for approval on breaking type changes
   - Choose versioning and release flow (workspace lockstep or independent semver) before migration starts

## Folder-by-Folder Execution Map (Crash-Resumable)

Use this map to execute changes in deterministic chunks and resume safely if work is interrupted.

| Scope | Current Path(s) | Target Path(s) | Completion Signal |
|---|---|---|---|
| Server app boundary | `src/**` | `apps/server/src/**` | `apps/server/package.json` exists, root `src/` removed |
| Shared contracts | `src/types/**`, `src/messages/**`, shared DTOs in `src/http/**` and `src/engine/**` | `packages/realtime-contract/src/**` | Both server and client import from `@poker-champ/realtime-contract` |
| Dealer domain flattening | `apps/server/src/engine/dealer/services/**` and `apps/server/src/engine/dealer/utils/**` | `apps/server/src/engine/dealer/turn/**`, `.../hand/**`, `.../settlement/**` | No imports from `dealer/services` remain |
| Backend tests | `apps/server/src/tests/**/*.test.ts` | Co-located under owning domain (`engine/**`, `http/**`, `rooms/**`) | `apps/server/src/tests` contains only integration suites |
| Client tests | `apps/client/src/tests/**`, `apps/client/src/test/**`, scattered `__tests__` | Co-located unit tests + keep `apps/client/e2e/**` | `src/tests` removed or only contains agreed integration tests |
| Public API boundaries | Deep imports across `src/**` and `apps/client/src/**` | Domain `index.ts` entrypoints | Lint + dep checks block deep imports |

### Required Checkpoint Files

Create and update these files in each phase PR so another developer can resume without context loss:

1. `docs/refactor/checkpoints/phase-N.md`: scope, done list, remaining list, known breakages.
2. `docs/refactor/checkpoints/phase-N-import-map.csv`: old import path -> new import path.
3. `docs/refactor/checkpoints/phase-N-moves.log`: file move list generated by codemod/script.
4. `docs/refactor/checkpoints/phase-N-verify.txt`: command outputs (`typecheck`, `test`, `lint`, boundary checks).
5. `docs/refactor/checkpoints/STATUS.md`: single source of truth for current phase and next command.

### Crash Recovery Protocol

If the migration is interrupted (machine crash, failed branch, partial codemod), resume with this order:

1. Read `docs/refactor/checkpoints/STATUS.md` and latest `phase-N.md`.
2. Re-run verification commands before additional edits:
   - `pnpm -r typecheck`
   - `pnpm -r test`
   - `pnpm -r lint`
3. Rebuild import graph checks (`dependency-cruiser` or `madge`) and compare to `phase-N-verify.txt`.
4. Continue only the remaining unchecked items from `phase-N.md`; do not start the next phase.
5. Regenerate `phase-N-import-map.csv` after each codemod run to avoid drift.
6. Open a stabilization PR if the phase cannot be completed in one session.

## Additional Standardization Opportunities

Beyond folder movement, this refactor is a good time to standardize conventions that reduce long-term entropy:

1. TypeScript baseline:
   - One shared base config in root (`tsconfig.base.json`) with strict flags.
   - App/package configs only override runtime/module specifics.
2. Import alias policy:
   - Standard aliases for `apps/client`, `apps/server`, and `packages/*`.
   - Ban mixed relative-depth imports (for example, `../../../../` in app code).
3. File naming conventions:
   - Decide and enforce one style (`PascalCase` for React components, `camelCase` for utilities/services, `kebab-case` for feature folders).
4. Test naming and placement:
   - Unit: `*.test.ts(x)` beside source.
   - Integration: `*.integration.test.ts` under `apps/*/src/tests`.
   - E2E: `*.e2e.spec.ts` under `apps/*/e2e`.
5. Shared error model:
   - Standard app error types/codes in a shared package so server/client/realtime use the same taxonomy.
6. Environment variable governance:
   - Single schema validation pattern for server and client env at startup.
   - Consistent names and documentation in `.env.example` files.
7. Logging/observability shape:
   - Standard structured log fields (`requestId`, `tableId`, `playerId`, `phase`, `durationMs`) across `http`, `engine`, and `rooms`.
8. API versioning discipline:
   - Version API contracts in `packages/realtime-contract` and `openapi.json` together, with a compatibility checklist in PR template.
9. Code generation boundaries:
   - Generated files (for example `packages/sdk/src/types.gen.ts`) should have explicit source-of-truth pointers and a single regeneration command.
10. CI pipeline consistency:
   - Standard pipeline order for all workspaces: `lint` -> `typecheck` -> unit -> integration -> e2e (targeted or nightly).

## Potential Blast Radius (Think-Through Before Execution)

This refactor has high operational risk if path changes are applied before command/config updates. The dominant risk is path-coupling, not domain logic correctness.

### Critical Risks

1. Build/runtime entrypoint coupling
   - Risk: Root TypeScript and build/start commands currently assume server source is under `src/**`.
   - Current hotspots:
     - `tsconfig.json` (`rootDir: "src"`, `include: ["src/**/*"]`)
     - root `package.json` build/start and server test scripts
   - Failure mode: compile/build failure and missing runtime entrypoint after move to `apps/server/src`.
   - Mitigation:
     - Introduce app-level server build commands first.
     - Keep temporary root compatibility scripts that delegate to `apps/server`.
     - Remove compatibility layer only after two green CI runs.

2. Test command hardcoding to `src/...`
   - Risk: Many scripts invoke `vitest run src/...` and will break after file moves/co-location.
   - Current hotspots:
     - root `package.json` (`test:server:*`, `test:client:*`)
     - `vitest.config.ts`, `vitest.awards.config.ts`
   - Failure mode: false red CI, skipped tests, incomplete verification.
   - Mitigation:
     - Convert commands to project-aware or glob-based patterns before moves.
     - Add a one-time script that validates no test script references stale paths.

3. Script import coupling (`scripts/** -> ../src/**`)
   - Risk: Existing automation scripts import from `../src/...` extensively.
   - Observed hotspot size: 41 import references.
   - Failure mode: operational scripts fail (seeders, smoke, churn, openapi/export).
   - Mitigation:
     - Run codemod rewrite for all script imports in a dedicated phase.
     - Verify each script command in `phase-N-verify.txt` after rewrite.

### High Risks

1. Architecture rule drift due to stale rule scopes
   - Risk: lint/dependency rules currently target `src/**`; they may silently stop enforcing boundaries after migration.
   - Hotspots:
     - `eslint.config.mjs`
     - `dependency-cruiser.cjs`
   - Mitigation:
     - During migration, support both roots (`src/**` and `apps/server/src/**`).
     - Add CI assertion that rule targets match existing directories.

2. Client E2E backend launch coupling
   - Risk: Playwright launches backend using root path assumptions.
   - Hotspot:
     - `apps/client/playwright.config.ts` (`tsx src/index.ts`)
   - Failure mode: E2E suite fails to boot backend.
   - Mitigation:
     - Introduce a stable backend launch script alias before server move.

### Medium Risks

1. Contract/codegen drift during path migration
   - Risk: OpenAPI and SDK generation commands can become desynchronized during partial migration.
   - Hotspots:
     - `scripts/export-openapi*`
     - `scripts/generate-api-shapes-docs.mjs`
     - `packages/sdk/src/types.gen.ts`
   - Mitigation:
     - Keep `sdk:gen` and OpenAPI export in the same PR gates.
     - Block merge if generated files are stale.

2. Test taxonomy misclassification
   - Risk: Current tests are mixed (`src/tests`, `src/http/__tests__`, `src/engine/__tests__`); bulk moves may misplace integration tests.
   - Mitigation:
     - Classify tests by behavior first (unit/integration/e2e), then move.
     - Preserve integration test grouping until suite parity is proven.

### Required Risk Controls Per Phase

1. Run before merge:
   - `pnpm -r lint`
   - `pnpm -r typecheck`
   - `pnpm -r test`
   - `pnpm madge`
   - `pnpm depcheck`
2. Add migration guard check: fail CI if scripts/config still reference forbidden stale roots after each phase.
3. Keep one phase per PR, with explicit rollback steps documented in `docs/refactor/checkpoints/phase-N.md`.
4. Require handoff artifacts (`STATUS.md`, import-map, verify output) before marking a phase complete.
11. Database Schema & ORM Extraction:
   - Extract the root `prisma/` directory and database clients into a dedicated `packages/db` workspace. This centralizes data models and migrations, allowing other apps (admin panels, background workers) to share the database client safely without duplicating generated clients.
12. Frontend State Management Consolidation:
   - Choose a singular standard (e.g., Zustand or Context) for global client state and establish clear conventions for what state belongs in a shared `stores/` directory versus isolated inside `features/`.
