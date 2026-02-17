# Odds Wiring Analysis and Implementation Proposal

## Objective
Determine whether `equity`, `pot odds`, and `outs` are wired into live game signals, and define a safe rollout for per-step updates without impacting gameplay stability.

## Current State Audit

### What exists today
- Server odds foundation exists:
  - `src/engine/odds/OddsService.ts`
  - `src/engine/odds/OddsCoordinator.ts`
  - `src/engine/odds/OddsCache.ts`
- Dependency already present:
  - `package.json` includes `poker-odds-calculator`.
- Unit tests exist for keying/coordinator behavior:
  - `src/tests/odds-cache.test.ts`
  - `src/tests/odds-coordinator.test.ts`
- UI already has calculation display components:
  - `apps/client/src/components/domain/table/CalculationsStrip.tsx`
  - `apps/client/src/components/domain/table/HeroZone.tsx`
  - `apps/client/src/components/domain/table/TableLayout.tsx`

### What is not wired
- `Dealer` does not currently call odds services:
  - `src/engine/Dealer.ts`
- Snapshot contract has no odds fields:
  - `packages/realtime-contract/src/table.ts`
- Table screen/layout do not bind live values (defaults remain placeholders):
  - `apps/client/app/table/[id].tsx`
  - `apps/client/src/components/domain/table/TableLayout.tsx`
- No separate odds event path is currently used in table realtime flow:
  - `apps/client/src/realtime/contract.guards.ts`
  - `apps/client/src/registry/realtime-channel.registry.ts`

## Services Status
Partially set up.
- Available now: equity calc, pot-odds helper primitive, cache/coordinator.
- Missing now: dealer integration, contract exposure, client binding, and any outs service.

## Recommended Snapshot Data Model

### Keep snapshot-first transport
Do not introduce a separate `ODDS_UPDATE` event for MVP. Keep all odds in `TABLE_SNAPSHOT`.

### Add personalized and global sections
- `hero.calculations` (personalized, safe to expose):
  - `equityPct?: number`
  - `potOddsPct?: number`
  - `outs?: number`
  - `updatedAtTs?: number`
  - `stale?: boolean`
- `calculationsMeta` (top-level, global metadata only):
  - `computedAtTs?: number`
  - `street?: Street`
  - `playersConsidered?: number`

Do not include other players’ equities in hero-visible payloads yet.

## Computation Semantics

### Equity
- Compute versus active opponents still in hand.
- Include `ALL_IN` players (they remain equity-relevant).
- Exclude `OUT` and `ABANDONED` players.
- Exclude folded players.
- Use board + known dead cards correctly.
- Guard:
  - if eligible opponents `< 1`, set `equityPct = 100`.

### Pot odds
- Prefer server action options as source of truth:
  - `toCallCents = hero.actionOptions?.callAmount ?? 0`
  - `potOddsPct = toCallCents <= 0 ? 0 : (toCallCents / (potCents + toCallCents)) * 100`
- This avoids duplicating betting-round legality math in multiple places.

### Outs (MVP scope)
- Restrict to FLOP and TURN only.
- Skip river.
- Restrict to heads-up only for MVP (2 active players).
- Define explicitly as:
  - `outs = cards that make hero at least tie by showdown`.
- Defer full multiway/advanced blocker semantics to later phase.

## Performance Strategy

### Compute once per state transition
Do not compute inside per-user `buildTableSnapshot` calls.

Pattern:
1. On transition/action acceptance/street advance, compute a `handCalculationsCache` once.
2. Cache keyed by current hand state hash/snapshot inputs.
3. Per-user snapshot read is O(1) lookup from cache.

This is the primary performance control.

## Failure Policy
- Odds must never block hand progression.
- If calc fails or times out:
  - log warning
  - omit affected values or mark `stale: true`
  - continue gameplay normally
- UI should render fallback (`--` or muted `0`) when stale/missing.

## Implementation Plan (Tightened)

### Phase 1 (fast win)
1. Contract: add `hero.calculations` and top-level `calculationsMeta`.
2. Dealer: implement compute pipeline and cache scaffold.
3. Implement pot odds only first (cheap, deterministic).
4. UI: bind `CalculationsStrip` to `snapshot.hero.calculations.potOddsPct`.

### Phase 2
1. Add equity via `OddsCoordinator` with cache/in-flight dedup.
2. Keep compute-once-per-transition rule.
3. Add tests for action-driven and street-driven updates.

### Phase 3
1. Add `OutsService` MVP (FLOP/TURN, heads-up, tie-or-better definition).
2. Add dedicated outs cache keying.
3. Add tests for FLOP/TURN correctness and skipped cases.

## Suggested File Change Map
- `packages/realtime-contract/src/table.ts`
- `src/engine/Dealer.ts`
- `src/engine/odds/OutsService.ts` (new)
- `src/engine/odds/OddsService.ts` (helper reuse)
- `apps/client/src/components/domain/table/CalculationsStrip.tsx`
- `apps/client/src/realtime/contract.guards.ts`
- `src/tests/table-snapshot.contract.test.ts`
- `src/tests/*` dealer odds integration tests

## Bottom Line
- Today: not wired end-to-end; UI values are placeholder-level.
- Existing services: useful equity base exists; outs is not implemented.
- Best rollout: snapshot-first, personalized exposure, transition-level cached compute, non-blocking failure behavior, phased MVP starting with pot odds.
