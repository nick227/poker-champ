# Round State Machine Phase 8 Proposal

Date: 2026-03-10  
Project: `poker-champ` (`apps/server`)

## Objective

Move hand progression logic from street-branch orchestration to a compact round-state machine:

`(state, now) -> computeNextStep -> driver executes -> state transition`

This isolates concerns:
- actor/timeout logic: round waiting state
- betting closure: round complete state
- card dealing: street advance transition
- all-in runout: explicit runout state

## Scope

In scope:
- Add `roundState` as first-class hand state.
- Route decision logic through `roundState` transitions.
- Keep `street` as data (card-deal context), not betting-control authority.

Out of scope:
- Full derived-`toAct` migration (Phase 9).
- Action-ring optimization (optional future step).

## Proposed State Model

```ts
type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
type RoundState = "ROUND_INIT" | "WAITING_FOR_ACTION" | "ROUND_COMPLETE" | "RUNOUT" | "SHOWDOWN" | "HAND_COMPLETE";

type HandState = {
  street: Street;
  roundState: RoundState;
  toActSeat: number;         // Phase 8: retained, validated
  turnDeadlineMs: number;    // already introduced in Phase 4
};
```

## Transition Table

1. `ROUND_INIT -> WAITING_FOR_ACTION`
   - when at least one eligible actor has `needsAction=true`
2. `ROUND_INIT -> ROUND_COMPLETE`
   - when betting is already closed at round entry
3. `WAITING_FOR_ACTION -> WAITING_FOR_ACTION`
   - on legal action where further action remains
4. `WAITING_FOR_ACTION -> ROUND_COMPLETE`
   - when betting closes
5. `WAITING_FOR_ACTION -> HAND_COMPLETE`
   - when only one non-folded player remains (last-player-standing payout path)
6. `ROUND_COMPLETE -> advance board/street -> ROUND_INIT`
   - after street advancement and next-round initialization
7. `ROUND_COMPLETE -> RUNOUT`
   - when all remaining players are all-in/folded and cards remain
8. `ROUND_COMPLETE -> SHOWDOWN`
   - when river complete or no further board cards are required
9. `RUNOUT -> SHOWDOWN`
10. `SHOWDOWN -> HAND_COMPLETE`
11. `HAND_COMPLETE -> hand closed`
    - next hand creation initializes a new hand at `ROUND_INIT`

## Decision Mapping

`computeNextStep(state, now)` should key off `roundState` first:

1. `WAITING_FOR_ACTION`
   - `RUN_BOT_ACTION` / `AUTO_ACTION_TIMEOUT` / `WAIT_FOR_HUMAN`
2. `ROUND_COMPLETE`
   - `ADVANCE_STREET` or `RUN_SHOWDOWN` (river/end condition)
3. `RUNOUT`
   - runout-deal step (existing staged runout behavior)
4. `SHOWDOWN`
   - showdown resolution step
5. `HAND_COMPLETE`
   - `START_NEXT_HAND`

Street checks remain only for:
- board card count/deal policy
- river terminal condition

## Required Invariants

1. `roundState=WAITING_FOR_ACTION` implies at least one eligible actor can act.
2. `roundState=ROUND_COMPLETE` implies no eligible actor has `needsAction=true`.
3. `turnDeadlineMs > 0` implies `roundState=WAITING_FOR_ACTION` and exactly one actionable turn is pending.
4. If the pending actor is a connected human, `turnDeadlineMs` may drive `AUTO_ACTION_TIMEOUT`.
5. If disconnected-human automation uses `turnDeadlineMs`, it must be explicitly documented and follow the same consume-on-execution rule.
6. If bot automation does not use `turnDeadlineMs`, that must be explicit in engine contract/tests.
7. `RUNOUT` implies no future player action is possible.
8. `SHOWDOWN` implies betting is closed and board is terminal for resolution.
9. `HAND_COMPLETE` implies `turnDeadlineMs=0`.
10. `ROUND_COMPLETE` implies `turnDeadlineMs=0`.
11. `RUNOUT` implies `turnDeadlineMs=0`.
12. Stored `toActSeat` mismatch with derived actor is warning-only in Phase 8 (`TO_ACT_DERIVATION_MISMATCH`), hard invariant candidate in Phase 9.

## Illegal Transition Rule

- Illegal round-state transitions must log and reject without mutating hand state.
- Recommended log event: `ROUND_STATE_TRANSITION_REJECTED`.

## Rollout Plan

### Phase 8A - Additive State + Observability
- Add `roundState` field to hand state.
- Mirror existing transitions into `roundState` updates without changing behavior authority.
- Emit `ROUND_STATE_TRANSITION` logs.
- Enforce illegal-transition reject/log behavior (non-mutating).

Done when:
- No behavior change regressions.
- Transition logs present and coherent across sampled hands.

Rollback:
- Disable `roundState` transition writes/logging via flag.

### Phase 8B - Decision Authority Flip
- Make `computeNextStep` branch on `roundState` first.
- Keep legacy street-branch code as fallback behind flag.

Done when:
- Parity checks pass on sampled production/staging hands.
- No increase in stuck-hand or invalid-turn incidents.

Rollback:
- Re-enable legacy street-branch decision authority flag.

### Phase 8C - Legacy Branch Cleanup
- Remove duplicate street-branch progression code after parity window.
- Keep diagnostics and transition logs sampled.

Done when:
- Only round-state path remains authoritative.

Rollback:
- Restore prior version (release rollback) if needed.

## Feature Flags

- `FEATURE_ROUND_STATE_MACHINE=true|false`
- `FEATURE_ROUND_STATE_DECISION_AUTHORITY=true|false`

Recommended sequence:
1. enable machine state write/log only
2. enable decision authority in canary
3. expand to full rollout

## Test Plan

Add deterministic fixtures covering:
1. normal preflop->river betting loop
2. fold-to-last-player path
3. all-in runout path
4. reconnect during waiting state
5. timeout transition (deadline consumed exactly once)
6. round-complete-to-next-round transition
7. river round-complete to showdown
8. invalid round-state transition guard (must reject/log)
9. last-player-standing transition (`WAITING_FOR_ACTION -> HAND_COMPLETE`)
10. deadline zeroing invariants for `ROUND_COMPLETE`, `RUNOUT`, `SHOWDOWN`, `HAND_COMPLETE`

## Phase 9 Follow-up

After Phase 8 is stable:
- migrate from stored-authoritative `toActSeat` to derived actor semantics.
- keep `snapshot.toActSeat` as computed output field.

Optional later:
- action-ring data structure for O(1) actor rotation if needed.
