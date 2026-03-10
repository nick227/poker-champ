# Phase 3 Handoff

## Done
- Flattened dealer services into hand/turn/settlement domains.
- Extracted Prisma + DB client to `packages/db` and rewired server imports.
- Migrated client table/lobby domains to `features/*` including components, stores, realtime, and table-page store hook.
- Rewrote imports across app routes, replay, hooks, registry, and service modules.
- Fixed vitest environment globs for moved hook tests.

## Remaining
- Phase 4 boundary hardening (`index.ts` public APIs, no-deep-import lint rules).
- Optional: clean up remaining generic root client folders (`realtime`, `hooks`, `services`) into feature-scoped boundaries over follow-on phases.

## Known Breakages
- `pnpm -r typecheck` currently fails in server test typing areas in this branch; this was observed while Phase 3 client migration validated green.

## Recovery Steps
1. Re-run:
   - `pnpm -C apps/client typecheck`
   - `pnpm -C apps/client test:run`
   - `pnpm test:server:core`
2. If green, continue Phase 4 from `docs/refactor/AI-migration-checklist.md` section "Phase 4".
