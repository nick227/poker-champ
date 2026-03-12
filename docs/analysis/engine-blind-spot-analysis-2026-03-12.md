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

## Remaining Blind Spots (Priority)

## P0 (highest risk)
1. Actor changes while old timer remains armed
- Risk: wrong player times out.
- Test: change `toActSeat` rapidly twice and assert only latest timer callback can mutate state.

2. Timeout fires after manual action
- Risk: double-apply (manual + timeout).
- Test: arm timeout, apply action immediately, assert timeout callback is inert.

3. Stale client action after turn advanced
- Risk: action mutates wrong turn.
- Test: submit delayed action with valid `actionId` after `handActionSeq` increments; assert reject/no mutation.

4. Seat removed while timer active
- Risk: timer callback references nonexistent actor.
- Test: remove seat mid-turn and assert timeout cancellation and clean progression.

5. Event-loop pause / delayed callback behavior
- Risk: late timeout mutates invalid state.
- Test: inject event loop delay and assert timer invariants still hold.

## P1 (high)
6. Actor becomes inactive mid-turn (sit out / bust / abandon)
- Risk: no re-derive, table idles.
- Test: force status change during waiting turn; assert next actor derivation and progress.

7. Hand restart race with stale callbacks
- Risk: old hand timer/automation mutates next hand.
- Test: end hand while old callbacks are pending; assert stale callbacks are discarded.

8. Queue starvation under load
- Risk: queue grows and progression slows without explicit stall.
- Test: synthetic burst enqueue; assert queue drains and progress heartbeat remains healthy.

9. Multi-table interference
- Risk: one hot table starves others.
- Test: 10 concurrent room soaks; assert per-table completion and no cross-table stall spikes.

## P2 (important reliability and debugging)
10. Broadcast ordering contract
- Risk: UI renders invalid sequence.
- Test: assert per-turn order contract for key events (`ACTION_RESULT` and `TABLE_SNAPSHOT` ordering policy).

11. Snapshot vs internal-state drift
- Risk: analyzers pass but runtime truth differs.
- Test: periodic assertion that exported snapshot projections match internal state invariants.

12. Persistence partial-failure payout path
- Risk: pot/stack divergence on write failure.
- Test: inject write failure between payout operations; assert rollback/compensation behavior.

13. Log schema drift breaks analyzers
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
1. timeout-after-action race
2. stale client action after turn advance
3. seat removal while timer active
4. event-loop pause simulation
5. multi-table concurrent soak

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
- This document tracks the remaining reliability gap, not solved issues.
