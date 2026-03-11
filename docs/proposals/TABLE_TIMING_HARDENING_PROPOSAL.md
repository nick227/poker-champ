# Table Timing Hardening Proposal

Date: 2026-03-10  
Project: `poker-champ` (`apps/server`)

## Objective

Harden table progression under production timing pressure (human think-time, reconnect churn, event-loop delay, bot scheduling) by making hand progression deterministic and recoverable.

Core question the engine must always answer:

`Given (state, now), what should happen next?`

## Current Codebase Baseline

Relevant runtime surfaces:

- `apps/server/src/engine/Dealer.ts`
- `apps/server/src/engine/dealer/turn/TurnManager.ts`
- `apps/server/src/engine/dealer/turn/TurnAutomationService.ts`
- `apps/server/src/engine/dealer/hand/HandLifecycleService.ts`
- `apps/server/src/rooms/PokerRoom.ts`

Observed fragility sources:

- Decision logic spread across dealer, lifecycle service, turn automation, and room-level stall monitor.
- Timer behavior depends on chained `setTimeout` in multiple places.
- Stall detection historically relied on snapshot silence heuristics.
- Reconnect/disconnect handling and seat state transitions can race with progression logic.
- Duplicate action retries require strong dedup/hand-scoping.

## Design Principles

1. Canonical decision authority: one pure decision function drives progression.
2. Time ownership at boundary: engine internals do not call `Date.now()`.
3. Absolute deadlines over elapsed timer assumptions.
4. Seat/hand state independent from connection transport state.
5. Serialized per-table execution (`requestDrive`) with idempotent recovery.

## Required Clarifications

1. `now` injection boundary is explicit:
   - Capture `now` exactly once at the top of `requestDrive()`.
   - Pass that `now` through all downstream decision functions.
   - Do not call `Date.now()` from decision engine internals.
2. Safety pulse is bounded:
   - Pulse only tables with an active hand and a pending deadline inside the next pulse interval.
   - Do not pulse idle/waiting tables or tables with no near-term deadline.
3. `requestDrive` ownership boundary:
   - `requestDrive` is implemented in `Dealer.ts`.
   - `requestDrive` is the only place where a table progression sequence may be initiated.
4. Safety pulse ownership boundary:
   - Safety pulse is owned and triggered by `PokerRoom`.
   - Safety pulse only calls `requestDrive`; it does not contain progression logic.
5. Projection rule:
   - If runtime dealer state already exposes required decision fields, use it directly.
   - If not, add `stateProjection.ts` to map runtime state to `DecisionState`.
6. Decision module rule:
   - `computeNextStep` and `getStallReason` must not embed poker rules.
   - Poker rule evaluation must come from existing services via `engineQueries.ts`.

## Proposed Target Model

Introduce pure decision API:

- `computeNextStep(state, now): EngineStep`
- `getStallReason(state, now): StallReason | null`

Decision input contract:

```typescript
type DecisionState = {
  tableId: string;
  players: Array<{
    id: string;
    seat: number;
    kind: "HUMAN" | "BOT";
    status: "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT" | "ABANDONED";
    connected?: boolean;
    connectionState?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "GONE";
    needsAction: boolean;
  }>;
  hand?: {
    handId: string;
    street: "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
    toActSeat: number;
    turnDeadlineMs?: number;
  };
};
```

`EngineStep` (initial set):

- `WAIT_FOR_HUMAN`
- `RUN_BOT_ACTION`
- `AUTO_ACTION_TIMEOUT`
- `ADVANCE_STREET`
- `RUN_SHOWDOWN`
- `START_NEXT_HAND`
- `NO_OP`

`NO_OP` is valid only when no actionable engine work is due at `now`:

- healthy waiting state
- no due deadline
- no actionable progression exists

Initial `StallReason` set:

- `INVALID_TO_ACT`
- `BOT_OVERDUE`
- `TURN_TIMEOUT_OVERDUE`
- `STREET_ADVANCE_OVERDUE`
- `SHOWDOWN_OVERDUE`

All orchestration paths call a serialized table driver:

- `requestDrive(reason, now?)`
- If `now` not supplied, capture once at boundary and pass through.

## Simple Task List

### Phase 0 - Pre-Implementation Safeguards

- [ ] Add `engine/dealer/decision/engineQueries.ts` as an adapter over existing rule/service logic (do not reimplement poker rules in the decision module).
- [ ] Run state-surface audit across `Dealer.ts`, `TurnManager.ts`, `TurnAutomationService.ts`, `HandLifecycleService.ts`, and `PokerRoom.ts` to verify decision inputs exist in runtime state.
- [ ] If runtime shape differs from decision shape, add `engine/dealer/decision/stateProjection.ts` to project runtime state into decision state.
- [ ] Ensure `PokerRoom` stall checks call `getStallReason` using the same projected decision-state shape as `computeNextStep`.

Done when:
- Decision module dependencies are explicit (`engineQueries`).
- Decision-state input shape is verified or projected.
- `PokerRoom` can call `getStallReason` without leaking room-specific state into decision logic.

Rollback:
- Keep current orchestration and stall flow unchanged; disable decision module wiring.

### Phase 1 - Decision Extraction + Observability

- [ ] Add `computeNextStep(state, now)` and `getStallReason(state, now)` in new engine decision module.
- [ ] Add `ENGINE_DECISION` trace logging with table/hand/street/toAct/step/stallReason.
- [ ] Wire existing progression calls so decision semantics come from `computeNextStep`; existing orchestration may still execute behavior, but no new parallel decision branches are added outside the decision module.
- [ ] Add config switch for sampled logging (table-scoped override + sampling rate).

Done when:
- Decision logs visible in prod.
- Assigned on-call backend engineer reviews ~50 sampled real hands and verifies each `ENGINE_DECISION.step` matches observed table state and intended progression, with any incorrect `NO_OP` or mismatched step logged as a defect.

Rollback:
- Disable `ENGINE_DECISION` logging and revert decision wiring to prior local orchestration decisions.

### Phase 2 - Deterministic Test Harness

- [ ] Add fake-clock harness for engine decision tests.
- [ ] Add deterministic fixtures for heads-up and multi-player states.
- [ ] Cover scenarios: blind all-in, human think-time, disconnect/reconnect, bot overdue, closed betting, invalid `toAct`.
- [ ] Enforce that decision functions accept `now: number` and avoid internal `Date.now()`.

Done when:
- Decision tests are deterministic and stable in CI.

Rollback:
- Keep harness files isolated from runtime path; no production behavior change.

### Phase 3 - Stall Detection Replacement

- [ ] Replace snapshot-silence stall trigger in `PokerRoom` with `getStallReason(state, now)`.
- [ ] Treat "waiting on connected human turn" as healthy state.
- [ ] Restrict redrive to actionable stall reasons (`INVALID_TO_ACT`, `BOT_OVERDUE`, `TURN_TIMEOUT_OVERDUE`, `STREET_ADVANCE_OVERDUE`, `SHOWDOWN_OVERDUE`).
- [ ] Emit structured stall diagnostics:
  - `TABLE_STALLED { tableId, handId, stallReason, street, toActSeat }`

Done when:
- `TABLE_STALLED` rate drops materially in production.
- Reviewed stalled hands only show actionable stall reasons.
- No increase in stuck-hand incidents.

Rollback:
- Re-enable legacy snapshot-silence stall detection flag/path.

### Phase 4 - Deadline-Based Turn Timing

- [ ] Add explicit `turnDeadlineMs` to hand/turn state.
- [ ] Update timeout decisions to compare `now >= turnDeadlineMs`.
- [ ] Keep legacy timeout scheduling firing temporarily, but ignore legacy timeout authority whenever deadline-based authority is enabled.
- [ ] Validate reconnect keeps deadline continuity.

Done when:
- Timeout decisions match deadline expectations in deterministic tests.
- Reconnect before deadline preserves the same acting seat and same deadline.
- No duplicate timeout firing under legacy-fallback mode.

Rollback:
- Disable deadline-based timeout authority and restore legacy timeout scheduling authority.

### Phase 5 - Action Dedup Hardening

- [ ] Enforce per-hand `processedActionIds` and reject duplicates.
- [ ] Define `processedActionIds` scope as per-hand runtime state: reset on new hand, bounded memory, never shared across hands.
- [ ] Reject stale hand actions (`handId` mismatch).
- [ ] Reject actions from non-`toAct` actor with explicit diagnostic.
- [ ] Add reconnect retry regression tests.

Done when:
- Duplicate replay and stale retry paths are blocked deterministically.

Rollback:
- Disable strict dedup gate and revert to prior action validation path.

### Phase 6 - Connection State Separation

- [ ] Introduce explicit connection state model (`CONNECTED`, `RECONNECTING`, `DISCONNECTED`, `GONE`).
- [ ] Stop mutating seat ownership/state directly on transport events.
- [ ] Update reconnect flows to mutate connection state first, poker state only via decision/driver.

Done when:
- Disconnect no longer corrupts seat/hand ownership semantics.
- Verified by replaying Phase 2 disconnect/reconnect integration tests against the new connection-state model (all pass).

Rollback:
- Restore prior reconnect/disconnect mutation path while preserving test harness.

### Phase 7 - Unified Table Driver

- [ ] Implement serialized `requestDrive(reason, now?)` as single progression entry point.
- [ ] Route triggers through driver: player action, reconnect/disconnect, deadline expiry, bounded safety pulse.
- [ ] Enforce single `now` capture at driver boundary.
- [ ] Remove redundant ad-hoc progression branches after parity verification.
- [ ] Add optional execution trace for parity verification:
  - `ENGINE_STEP_EXECUTED { tableId, handId, step }`

Done when:
- All progression entry points route through `requestDrive`.
- Ad-hoc progression paths are removed or explicitly marked dead.
- Parity is verified against sampled production hands.
- `computeNextStep` is sole decision authority for progression.

Rollback:
- Bypass `requestDrive` as sole entry point and restore prior orchestration path.

## Engine Invariants

- A connected human with valid turn and unexpired deadline is not stalled.
- Disconnected humans are treated as automated actors for decision semantics.
- Disconnect does not directly remove seat ownership.
- A stale `handId` action never mutates current hand state.
- A duplicate `actionId` never applies twice.
- If betting is closed and no further player action is possible, engine progresses to street advance or showdown.
- Every engine decision is derivable from `(state, now)` with no hidden timer state.

## Rollout and Safety

- Ship each phase independently behind feature flags where needed.
- Keep rollback for each phase (disable flag + return to prior path).
- Keep high-signal diagnostics on by sampling during rollout.

## CI Readiness Gate

Phase 7 extraction is now protected by CI readiness gates in soak workflows.

Required checks:

- `analyze:phase4:gate` must pass.
- `analyze:phase7:ready` must pass.

`analyze:phase7:ready` enforces:

- No stall/timeout invariant regressions.
- `decisionRuntimeMismatches == 0`.
- Parity evidence exists (`decisionRuntimePairs >= 1`).
- Dead-path candidate count does not exceed configured baseline (`PHASE7_DEAD_PATH_BASELINE`).

Workflow baseline:

- `PHASE7_DEAD_PATH_BASELINE=16`

How to update baseline safely:

1. Land intentional dead-path cleanup changes.
2. Run two clean soak+parity cycles.
3. Re-run `analyze:phase7:dead-paths` and record new `CandidateCount`.
4. Update `PHASE7_DEAD_PATH_BASELINE` in CI workflows to the new count in the same PR.
5. Do not increase baseline without corresponding reviewed cleanup/context.

## Why Not Phase 7 Yet

Phase 7 (single unified driver) is a high-blast-radius refactor. We should not move to it until Phase 4/5 behavior is repeatedly clean under soak and analyzer gates.

What prolonged testing is accomplishing now:

- Verifies deadline authority is actually stable under churn (`timeoutDoubleFires=0`, `timeoutWithMissingDeadline=0`, `deadlineOutsideWaiting=0`).
- Proves the specific historical stall class is gone (`waitingHumanMissingDeadline=0`, `waitingHumanNoNeedsAction=0`, `TABLE_STALLED` near zero).
- Confirms action idempotency under retries/replays before centralizing all progression paths.
- Establishes a reliable baseline so Phase 7 regressions are obvious and attributable.
- Reduces incident risk: without this baseline, a Phase 7 regression can be misdiagnosed as "old noise."

In short: prolonged testing is not delay; it is blast-radius reduction and signal calibration before a structural authority flip.

## Immediate Execution Checklist (Current Stage)

- [ ] Run one clean validation soak (`SOAK_HANDS=300`, `LOG_LEVEL=info`, heartbeat on).
- [ ] Run extended soak (`SOAK_HANDS=1000+`) and archive logs in `var/logs`.
- [ ] Run both analyzers on each capture:
  - `pnpm --dir apps/server analyze:game-bugs --file <log>`
  - `pnpm --dir apps/server analyze:phase4 -- --file <log>`
- [ ] Confirm gate metrics are clean:
  - `tableStalled=0`
  - `timeoutDoubleFires=0`
  - `timeoutWithMissingDeadline=0`
  - `deadlineOutsideWaiting=0`
  - `waitingHumanMissingDeadline=0`
  - `toActMismatchCount=0`
- [ ] Freeze Phase 4 logic to bugfix-only.
- [ ] Complete/lock Phase 5 dedup gates in CI.
- [ ] Start Phase 7 only after two consecutive clean soak/analyzer runs.

## Phase 7 Safety Sequence (Low-Risk Order)

Apply Phase 7 in this order:

1. Extract pure decision layer (`engineQueries.ts`, `computeNextStep`, `getStallReason`, and `stateProjection.ts` only if runtime state shape requires it).
2. Emit decision traces in staging/production sampling.
3. Compare decision outputs against current runtime behavior.
4. Route one trigger path through `requestDrive`.
5. Expand trigger coverage incrementally.
6. Remove legacy ad-hoc progression branches last.

Authority flip rule:

- Do not make `requestDrive` sole progression authority until parity is proven.

Hard parity requirement before authority flip:

- For sampled real hands, `runtimeStep == computeNextStep(state, now)` must hold.
- If diverged, log as defect and block authority flip until resolved.

## Expected Outcomes

After Phases 1-3:

- Accurate stall diagnostics.
- Clear reasoning visibility in production.
- Fewer false recovery drives.

After Phases 4-7:

- Deadline-driven, reconnect-safe turn progression.
- Reduced timer drift sensitivity.
- Deterministic, idempotent recovery from any trigger.
- Simpler and auditable orchestration model.


Summary Based on the full spec:

Extract the decision engine — Create computeNextStep and getStallReason as pure functions, wire ENGINE_DECISION logging into production, and review sampled hands to confirm the logic is correct before changing any behavior.
Build the test harness — Write fake-clock deterministic tests covering every edge case (blind all-in, disconnect mid-turn, bot overdue, etc.) so every subsequent phase has a safety net before it ships.
Fix observability and stall detection — Replace the snapshot-silence heuristic with getStallReason, eliminating false TABLE_STALLED spam and making "waiting on human" an explicitly healthy state.
Harden timing and actions — Introduce turnDeadlineMs for reconnect-safe turn expiry, and add per-hand action deduplication to block duplicate replays from reconnect retries.
Unify orchestration — Separate connection state from seat ownership, then consolidate all progression through a single serialized requestDrive driver with computeNextStep as the sole decision authority.
