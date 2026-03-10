# Phase 4 Handoff

## Done
- Established domain public APIs via `index.ts` for:
  - `apps/server/src/engine/dealer`
  - `apps/client/src/features/table`
  - `apps/client/src/features/lobby`
- Rewired cross-domain imports to consume public feature/domain surfaces instead of deep internals.
- Added/updated boundary enforcement in ESLint configs.
- Removed stale active config references to deleted `packages/api-types` and aligned on `packages/realtime-contract`.
- Verified architectural boundaries with dependency-cruiser and targeted deep-import sweeps.

## Verification
- See `docs/refactor/checkpoints/phase-4-verify.txt`.

## Remaining
- `pnpm -r lint` is still red from existing server lint debt (673 errors) that predates boundary hardening completion.

## Recovery Steps
1. Re-run:
   - `pnpm server:typecheck`
   - `pnpm -C apps/client typecheck`
   - `pnpm -C apps/client lint`
   - `pnpm exec depcruise --config dependency-cruiser.cjs apps/server/src apps/client/src packages`
2. Decide lint strategy:
   - either burn down server lint debt now,
   - or add a temporary scoped lint gate focused strictly on boundary rules until debt is addressed.
