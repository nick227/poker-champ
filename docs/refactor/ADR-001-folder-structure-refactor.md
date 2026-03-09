# ADR 001: Monorepo Folder Structure Refactoring

**Status:** Proposed  
**Date:** March 2026  
**Authors:** Architecture Team  

## 1. Context and Problem Statement

The `poker-champ` codebase currently operates with a fractured interpretation of the monorepo pattern. It contains `apps/client`, `packages/sdk`, and `packages/realtime-contract`, but the core backend engine and API sit directly in a massive root `src/` directory. 

Furthermore, test placement is highly inconsistent (centralized `src/tests/` vs. scattered inline `__tests__/`), domain logic is hidden behind generic technical folders (e.g., `src/engine/dealer/services/`), and shared schema/types are not explicitly isolated. This lack of strict architectural boundaries leads to deep imports, type desynchronization, and high cognitive load when navigating the codebase.

## 2. Decision

We will execute a sweeping folder structure refactoring to align the codebase with standard, scalable monorepo conventions. Specifically, we will:

**1. Re-align App Boundaries:**
- Move the root backend code from `src/` into a dedicated `apps/server/src/` workspace.

**2. Standardize Test Co-location:**
- Migrate all unit tests to sit exactly next to the source files they test across the entire monorepo (e.g., `TurnManager.ts` next to `TurnManager.test.ts`).
- Restrict centralized `tests/` folders exclusively for cross-module integration and `e2e/` suites.

**3. Move from Layer-Based to Domain/Feature-Based Organization:**
- Flatten generic layering folders (like `services/`, `utils/`) on the server. Group files by domain intent (e.g., `dealer/turn/`) instead.
- Re-organize the frontend client from generic roles (`components/`, `stores/`) to feature domains (`features/table/`, `features/lobby/`).

**4. Establish Explicit Public APIs:**
- Institute `index.ts` files at all domain boundaries to define explicit public contracts.
- Implement strict linting rules (`no-restricted-imports`) to programmatically ban deep imports into domain internals from outside spaces.

**5. Formalize Shared Logic Packages:**
- Extract shared TypeScript interfaces from the `src/` and client into a strict `packages/api-types` workspace.
- Extract the root `prisma/` schema and database clients into a `packages/db` workspace so that workers and admin apps can share the ORM without duplication.

## 3. Rollout Strategy & Risk Mitigation (Blast Radius)

This refactoring affects deep execution paths, build tools, and CI pipelines. To mitigate the massive blast radius (merge hell, runtime configuration crashes, and import rot), the migration will be executed strictly under the **Pre-flight Checklist** and **Crash Recovery Protocol**:

1. **Phased Execution:** The migration will occur in discrete, PR-gated phases (App Boundaries -> Test Co-location -> Folder Flattening -> Enforcement). Each phase must prove 100% CI compliance before merging.
2. **Configuration Override First:** Build commands, Dockerfiles, `tsconfig.json` paths, and test runner configurations will be updated to support the new paths *before* the files are actually moved.
3. **No Manual Renames:** All file movements and import rewrites will be driven by deterministic codemods and scripts, dumping `docs/refactor/checkpoints/phase-N-moves.log` to track exactly what moved.
4. **Resumability Checkpoints:** Every phase will utilize hand-off tracking (`STATUS.md`, `phase-N.md`) to survive interruptions or required rollbacks.
5. **Freeze Communication:** A codebase feature-freeze will be declared for dependent phases to prevent overlapping Git histories and merge resolution hell.

## 4. Consequences

### Positive
- **Velocity & Discoverability:** Co-locating tests and grouping by feature significantly lowers the context-switching tax.
- **Enforceable Boundaries:** CI/CD tooling (ESLint, Dependency Cruiser) will easily validate boundary scopes (`apps/` vs. `packages/`).
- **Safety:** Extracting shared types and DB schemas into dedicated packages isolates the frontend from backend orchestration changes.

### Negative / Risks
- **Short-term Disruption:** The codebase will shift radically under the team's feet, requiring a re-learning of the directory map.
- **Hidden Breakages:** Dynamic (`await import()`) or runtime file-system reads (`fs.readFileSync`) might bypass codemods and cause hidden staging crashes. Handled by the phase-by-phase E2E/Integration test mandate.
