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
Adopt a consistent **co-location** strategy for tests across the entire monorepo. 
- Move `*.test.ts` files to sit exactly next to the files they test.
  - E.g., `src/engine/dealer/services/TurnManager.ts` should have `src/engine/dealer/services/TurnManager.test.ts` right next to it.
- **Why?** Co-location dramatically improves discoverability. When a developer modifies a file, the test is immediately visible. It also makes moving, renaming, or deleting features much safer, as the tests naturally travel with the source file. Remove the centralized `tests/` folders altogether.

## Priority 3: Eliminate Redundant Layers (e.g., `services/`)

**Current State:**
There is unnecessary nesting that artificially inflates import paths and hides domain logic. The prime example is `src/engine/dealer/services/`, which contains 12 core domain files (`TurnManager.ts`, `ActionService.ts`, `HandLifecycleService.ts`). 

**Recommendation:**
Remove generic container folders like `services/`, `utils/`, or `helpers/` when they sit inside a specific cohesive domain (like `dealer`). 
- Flatten `src/engine/dealer/services/*` directly into `src/engine/dealer/`.
- If `src/engine/dealer/` becomes too large, group the files by **feature** rather than by technical role (e.g., `src/engine/dealer/lifecycle/`, `src/engine/dealer/turn/`) instead of a catch-all `services/` folder.
- **Why?** "Services" is a generic technical term that doesn't describe the business domain. Dropping these folders reduces boilerplate in imports like `import { TurnManager } from '../dealer/services/TurnManager'` -> `import { TurnManager } from '../dealer/TurnManager'`.

## Summary of Proposed Target Structure

```text
poker-champ/
├── apps/
│   ├── client/
│   │   └── src/
│   │       ├── components/
│   │       ├── features/
│   │       └── ... (Tests co-located: e.g. Table.tsx, Table.test.tsx)
│   └── server/          <-- (Moved from root src/)
│       └── src/
│           ├── engine/
│           │   └── dealer/
│           │       ├── TurnManager.ts
│           │       ├── TurnManager.test.ts   <-- (Co-located test)
│           │       ├── ActionService.ts
│           │       └── ActionService.test.ts
│           ├── http/
│           └── ...
├── packages/
│   ├── realtime-contract/
│   └── sdk/
└── package.json
```

## Next Steps
1. Create `apps/server` (or `apps/engine`), initialize its `package.json`, and move the root `src/` directory into it. Update workspace references.
2. Run a migration script to automatically move `tests/**/*.test.ts` files to their corresponding source directories based on import statements or filename matching.
3. Flatten the `src/engine/dealer/services` directory and update the imports across the codebase.
