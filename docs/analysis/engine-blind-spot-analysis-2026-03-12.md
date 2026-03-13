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

## Remaining Blind Spots (Priority)

## P2 (important reliability and debugging)
11. Snapshot vs internal-state drift
- Risk: analyzers pass but runtime truth differs.
- Test: periodic assertion that exported snapshot projections match internal state invariants.

12. Log schema drift breaks analyzers
- Risk: false green pipeline.
- Test: schema contract test for required log fields and messages.

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
- `TURN_START` (or equivalent decision-to-wait)
- `ACTION_RECEIVED`
- `ACTION_RESOLVED`
- `NEXT_ACTOR`

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

## Recommended Next 5 Tests (execution order)
1. explicit log schema contract test with source-of-truth fixture
2. snapshot vs internal-state drift
3. required observability field contract (`buildSha`, lifecycle fields)
4. analyzer fail-closed proof on missing required fields/messages
5. CI lane wiring for log contract enforcement

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
- The remaining gap is now:
  - P2 projection drift
  - P2 observability/schema contract enforcement
- The observability field list in this document is a requirement target, not an enforcement mechanism. The real gap remains a CI contract test that fails when required fields or parse-stable events drift.
