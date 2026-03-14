# Poker Engine Blind Spot Analysis
Date: 2026-03-12  
Scope: Phase 7 hardening after progression and parity stabilization

## Objective
Capture remaining high-risk blind spots where:
- state appears valid but progress can silently stop
- duplicate/stale callbacks can mutate wrong turn/hand
- logs are insufficient to reconstruct incidents quickly

## Current Baseline
Already covered by new regression + soak gate:
- disconnected human at turn start progression (`DRIVE-R06`)
- duplicate action replay idempotency (`RETRY-R01`)
- stale queued auto-action after hand transition (`AUTO-WARN-R05`)
- timer rearm race on same turn (`TIMER-RACE-R01`)
- room-level session rebound replay idempotency

## Status Update (2026-03-13)
Priority coverage has materially improved since this document was written.

Addressed with direct test coverage:
- P0.1 actor changes while old timer remains armed
  - Covered by `TIMER-RACE-R02` in `apps/server/src/engine/dealer.auto-action-warning.regression.test.ts`.
- P0.2 timeout fires after manual action
  - Covered by `TIMER-RACE-R03` in `apps/server/src/engine/dealer.auto-action-warning.regression.test.ts`.
- P0.3 stale client action after turn advanced
  - Covered by `rejects stale client action after turn has advanced` in `apps/server/src/rooms/table-action-broadcast.test.ts`.
- P0.4 seat removed while timer active
  - Covered by `DRIVE-R07` in `apps/server/src/engine/dealer.auto-action-warning.regression.test.ts`.
- P0.5 event-loop pause / delayed callback behavior
  - Covered by `simulated event-loop pause: overdue timeout still fires once and clears deadline` in `apps/server/src/engine/dealer/turn/__tests__/TurnManager.test.ts`.
- P1.6 actor becomes inactive mid-turn
  - Covered by `DRIVE-R08` and `re-derives actor when human becomes inactive mid-turn`.
- P1.7 hand restart race with stale callbacks
  - Covered by `TIMER-RACE-R04` and `mixed stale timeout + queued callback from prior hand are inert after hand restart boundary`.
- P1.8 queue starvation under load
  - Covered by `handles burst action pressure without queue starvation` and room-level burst coverage.
- P1.9 multi-table interference
  - Covered by `runs concurrent tables without stalls` in `apps/server/src/rooms/poker-room.multitable.soak.test.ts`.
- P2.10 broadcast ordering contract
  - Covered by `broadcast ordering emits valid post-action progression snapshots` in `apps/server/src/rooms/table-action-broadcast.test.ts`.
- P1.11 persistence partial-failure payout path
  - Runtime divergence case covered by money-safety tests in `apps/server/src/engine/dealer/settlement/settlement-service.money-safety.test.ts`.
  - Settlement now applies payouts ledger-first, and failed hand-history payout persistence emits `HAND_HISTORY_PAYOUT_RECORD_FAILED` with `handId`, `tableId`, `recipientUserId`, `payoutIndex`, and `amountCents`.
- Follow-up on same-recipient concurrent credits
  - Covered by `atomically credits concurrent payouts for the same recipient without lost updates` in `apps/server/src/engine/persistence/LedgerService.concurrent.test.ts`.
  - `LedgerService` now uses atomic balance updates inside the transaction rather than read-then-write balance assignment.
- P2.11 snapshot vs internal-state drift
  - Covered for decision-critical and hand-boundary parity by `apps/server/src/engine/table-snapshot.state-parity.test.ts`.
- P2.12 log schema drift breaks analyzers
  - Covered by `apps/server/src/log-schema-contract.test.ts` for `TABLE_STALLED`, `TABLE_STALLED_RECOVERY_REDRIVE`, `ENGINE_DECISION`, `ENGINE_RUNTIME_STEP`, `ENGINE_PARITY`, `ENGINE_PARITY_MISMATCH`, and real lifecycle events (`POKER_ACTION_ATTEMPT`, `ACTION_ACCEPTED`, `POKER_ACTION_ACCEPTED`, `NEXT_ACTOR_SELECTED`).
  - Existing soak-time validation in `apps/server/scripts/check-log-schema-contract.mjs` remains a secondary log-file gate for soak output.
  - The soak gate requires presence for normal-path soak events (`ENGINE_DECISION`, `ENGINE_RUNTIME_STEP`, `ENGINE_PARITY`, `DEALER_RUNTIME_METRICS`), while fault-path event presence remains covered by the unit contract test.

## Remaining Blind Spots (Priority)
None in the original blind-spot list are still open as untested regression risks.

## Remaining Observability Follow-ups
- `buildSha` is still a requirement target in this document, but it is not emitted yet and is not enforced by the current contract test.
- Dealer-owned engine logs (`ENGINE_DECISION`, `ENGINE_RUNTIME_STEP`, `ENGINE_PARITY`, `ENGINE_PARITY_MISMATCH`) still do not carry `roomId`; that is a separate observability enhancement, not a schema-drift blind spot.

## Observability Blind Spots
Required on all critical logs:
- `roomId`
- `tableId`
- `handId`
- `decisionTraceId` (when decision-related)
- `buildSha`

Critical events that must remain parse-stable:
- `TABLE_STALLED`
- `TABLE_STALLED_RECOVERY_REDRIVE`
- `ENGINE_DECISION`
- `ENGINE_RUNTIME_STEP`
- `ENGINE_PARITY`
- `ENGINE_PARITY_MISMATCH`

Turn lifecycle reconstruction target:
- `POKER_ACTION_ATTEMPT`
- `ACTION_ACCEPTED`
- `POKER_ACTION_ACCEPTED`
- `NEXT_ACTOR_SELECTED`

If one is missing, incident triage quality degrades.

## Goals (next phases)

## Goal A: Race Safety
Eliminate stale timeout/action mutation across turn/hand boundaries.

Acceptance:
- new P0 race tests green in CI
- no duplicate apply from timeout/action races

## Goal B: Progress Safety
Prevent silent idling under queue stress and actor transitions.

Acceptance:
- queue starvation test green
- event-loop delay test green
- no `TABLE_STALLED` in targeted stress runs

## Goal C: Multi-table Stability
Prove fairness and isolation across concurrent tables.

Acceptance:
- 10-table soak (100+ hands/table) with:
  - `tableStalled=0`
  - no parity mismatches
  - hand completion rate in target window

## Goal D: Analyzer Integrity
Ensure log contracts remain stable and analyzers fail closed.

Acceptance:
- log schema contract test in CI
- analyzer fails on missing required fields/messages

## Recommended Next 5 Tests / Follow-ups (execution order)
1. required observability field contract follow-up (`buildSha`, and `roomId` where feasible)
2. analyzer fail-closed proof on missing required fields/messages
3. CI lane audit to ensure the new log contract test remains in required coverage
4. hero-visibility / snapshot filtering contract as a separate concern from parity
5. broader log fixture expansion if new parse-stable events are promoted to incident-critical status

## CI Integration Plan
- Extend quick gate with P0 deterministic tests.
- Add nightly lane:
  - multi-table soak
  - longer duration soak
  - analyzer + canary validation
- Fail build on:
  - any new stall events
  - parity mismatch
  - log schema contract break

## Notes
- Existing regression and room-soak gates are now a strong baseline.
- As of 2026-03-13, the original P0 and P1 items are covered by tests in-repo.
- The original regression blind spots in this document are now covered by in-repo tests.
- The observability field list in this document is now partially enforced by tests for current emitters, but `buildSha` and dealer-level `roomId` remain follow-up enhancements rather than active contract coverage.
