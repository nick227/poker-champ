# Testing Coverage Assessment

As of: 2026-02-18

## Scope and method
This assessment is based on repository inspection of:
- test files under `src/tests`, `src/engine/__tests__`, `apps/client/src/tests`, `apps/client/src/stores/__tests__`
- test/coverage config in `vitest.config.ts`, `vitest.config.js`, `apps/client/vitest.config.ts`
- CI workflows in `.github/workflows/*.yml`
- root and client scripts in `package.json` and `apps/client/package.json`

## Coverage snapshot (what exists today)
- Server tests: 33 files in `src/tests` + 1 file in `src/engine/__tests__`.
- Client tests: 11 files in `apps/client/src/tests` + 1 file in `apps/client/src/stores/__tests__`.
- Approximate test-case count (`it(...)`):
- Server: 119
- Client: 34

## Areas with meaningful coverage
- Core dealer and hand-flow behavior has good regression coverage:
- table snapshots and contract shape (`src/tests/table-snapshot.contract.test.ts`)
- action broadcast/realtime flow (`src/tests/table-action-broadcast.test.ts`)
- side pots, split pots, betting rules, invariants (`src/tests/sidepots*.test.ts`, `src/tests/split-pot.test.ts`, `src/tests/betting-*.test.ts`)
- deterministic showdown/hand lifecycle (`src/tests/showdown.determinism.test.ts`, `src/tests/hand-lifecycle*.test.ts`)
- race/integration cases for economy and ledger (`src/tests/economy-race.integration.test.ts`, `src/tests/ledger-enforcement.integration.test.ts`)
- Client has focused tests on mapping/guards/store logic:
- action mapping and wager routing (`apps/client/src/tests/action.mapper.test.ts`, `apps/client/src/tests/action-bar.wager.test.ts`)
- realtime/store guard rails (`apps/client/src/tests/useRealtimeChannel.guard.test.ts`, `apps/client/src/tests/table.store.test.ts`)

## Key gaps

### 1) CI gate executes only a narrow server subset
- Root `verify` runs only:
- `test:client`
- `test:server:core`, which currently runs only `table-join.guard` and `table-action-broadcast`.
- Result: many server tests exist but are not guaranteed by default CI gating.

Evidence:
- `package.json` scripts: `test:server:join`, `test:server:broadcast`, `test:server:core`, `verify`
- `.github/workflows/contract-first.yml` runs `pnpm verify`

### 2) No enforced coverage threshold
- Coverage reporters are configured (`text`, `html`) in root Vitest config, but no branch/line/function thresholds are enforced.
- No Codecov/coverage gate workflow detected.

Evidence:
- `vitest.config.ts`, `vitest.config.js`
- No coverage enforcement workflow under `.github/workflows`

### 3) Dealer messaging UI behavior lacks direct tests
- `DealerAnnounceBar` render priority and countdown behavior are implemented but untested directly.
- No tests found for:
- `deriveMessage` precedence (`actionMessage` vs `handResultMessage` vs street/pot/waiting)
- countdown behavior from `nextHandAtTs`
- reconnect/duplicate snapshot dedupe behavior at UI layer

Evidence:
- `apps/client/src/components/domain/table/DealerAnnounceBar.tsx`
- no matching tests in `apps/client/src/tests` or `apps/client/src/stores/__tests__`

### 4) Service-level unit isolation is thin for dealer service modules
- Service files under `src/engine/dealer/services` are mostly covered indirectly via `Dealer`/room tests.
- Direct tests referencing service modules are sparse or absent for:
- `ActionService.ts`
- `SettlementService.ts`
- `PlayerLifecycleService.ts`
- `TurnAutomationService.ts`

Risk: regressions inside service boundaries can be harder to localize and debug.

### 5) Duplicate client store test file
- `apps/client/src/tests/table.store.test.ts` and `apps/client/src/stores/__tests__/table.store.test.ts` are effectively duplicates.
- Risk: maintenance drag and accidental divergence.

## Dealer messaging specific assessment
The server-side `lastAction` channel is materially covered in contract/integration paths (for example in `table-snapshot.contract` and `table-action-broadcast`).

Remaining high-risk gap is client presentation behavior:
- explicit announce priority order
- hand-end message interaction window
- duplicate-action replay suppression in UI state

Given current code direction, these UI tests should be added before further copy/UX refinements.

## MVP hard vs soft validation

### Hard validation (must-have for MVP)
1. Betting and chip movement correctness.
2. Fold/abandon/remove equivalence on pot/chip outcomes.
3. Snapshot to client money integrity (render exactly server values).

### Soft validation (can be deferred in MVP)
1. Dealer announce copy quality.
2. Animations and layout polish.
3. Reconnect UX polish beyond correctness guarantees.
4. Coverage percentage targets as a goal by themselves.

## Recommended priority plan

### Priority 0 (CI and confidence)
1. Expand CI test gate beyond two server tests.
2. Add a dedicated `test:server` script that runs all server tests intended for PR gate.
3. Add coverage threshold policy (start modest; ratchet upward).

### Priority 1 (money-safety rails)
1. Add `SettlementService` service-level deterministic tests:
   - given pots and winners, payout allocation is correct
   - no negative stacks
   - no phantom chips (conservation holds)
2. Add fold/abandon/disconnect matrix tests asserting equivalent money outcomes:
   - active fold path
   - consented leave or abandon path with forced fold first
   - disconnected auto-fold path
3. Add 1-2 thin adapter tests that assert snapshot money fields map to rendered values:
   - `potCents`
   - `players[].stackCents`

### Priority 2 (structural quality)
1. Add focused unit tests for dealer service modules beyond money paths (`ActionService`, `TurnAutomationService`, `PlayerLifecycleService`) where regressions are likely.
2. Remove/merge duplicate `table.store` tests into one canonical location.
3. Add dealer announce presentation tests only after money-safety priorities are complete.

## Suggested target state
- Every critical gameplay path covered by at least one fast deterministic test and one integration path.
- CI blocking path runs full intended server+client suites.
- Coverage thresholds enforced in CI.
- Dealer announce UX tested end-to-end from `lastAction` snapshot to rendered banner text.

## Merge gate heuristic
Before merging, ask: "Could this change alter chip totals, pot size, or payout recipients?"

- If yes: require deterministic test coverage in the same change.
- If no: test is recommended but not a hard MVP gate.
