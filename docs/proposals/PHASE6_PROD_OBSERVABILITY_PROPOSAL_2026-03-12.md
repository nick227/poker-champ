# Phase 6 Production Observability Proposal (2026-03-12)

## Context

Phase 4/5 runtime stability gates are passing in both engine soak and PokerRoom soak:

- `room-soak:validate` PASS (`handsStarted=30`, `handsCompleted=30`, `tableStalled=0`)
- `analyze:phase4:gate` PASS
- `analyze:canary` PASS

Recent incidents show that manual gameplay can still reveal edge timing behavior before it is obvious from aggregate test output. Phase 6 should focus on operational detection and fast triage, not architecture changes.

## Goals

1. Detect production-impacting stalls and timeout corruption before players report them.
2. Preserve existing Phase 4/5 reliability invariants in live traffic.
3. Standardize alert thresholds and runbooks so incidents are diagnosable in minutes.
4. Keep rollout low-risk: observability only, no authority model changes.

## Research Summary (Current Signal Surface)

### Runtime logs emitted by PokerRoom

Source: `apps/server/src/rooms/PokerRoom.ts`

- `TABLE_STALLED`
  - Includes: `roomId`, `tableId`, `handId`, `stallReason`, `street`, `toActSeat`, `snapshotSeq`, `lastSnapshotAt`, `stallAgeMs`, `turnAgeMs`, `decisionTraceId`, `queueDepth`
- `TABLE_STALLED_RECOVERY_REDRIVE`
  - Includes: `roomId`, `tableId`, `handId`, `stallReason`, `stallAgeMs`, `turnAgeMs`, `decisionTraceId`
- `DEALER_RUNTIME_METRICS` (periodic)
  - Includes:
    - `activeTables`
    - `waitingTurns`
    - `tableStalled`
    - `tableStallRecoveryRedrive`
    - `handsStarted`
    - `handsCompleted`
    - `handsPerMinute`
    - `actionRejected`
    - `actionRejectedByCode`
    - `turnTimeoutFired`
    - `actionProcessMsSamples`
    - `actionProcessMsMean`
    - `actionProcessMsMax`
    - `queueDepthSamples`
    - `queueDepthMean`
    - `queueDepthMax`
    - `decisionParitySamples`
    - `decisionParityMismatch`

### Decision and parity logs

Source: `apps/server/src/engine/Dealer.ts`

- `ENGINE_DECISION_STATE`
- `ENGINE_DECISION`
- `ENGINE_RUNTIME_STEP`
- `ENGINE_PARITY`
- `ENGINE_PARITY_MISMATCH`

These are essential for proving decision-runtime alignment and identifying authority drift.

### Analyzer-derived invariants

Source: `apps/server/scripts/analyze-game-bugs-timeouts.mjs`

Key computed metrics already used in gates:

- `tableStalled`
- `stallRecoveryRedrive`
- `timeoutDoubleFires`
- `timeoutWithMissingDeadline`
- `deadlineOutsideWaiting`
- `waitingHumanMissingDeadline`
- `waitingHumanNoNeedsAction`
- `tableStalledMissingReason`
- `tableStalledMissingReasonConnectedHuman`
- `toActMismatchCount`
- `handCompletionRate`

## Proposed Alert Catalog

### Live vs Batch split (required)

Phase 6 should be explicitly split:

1. Live monitors (pager/Slack)
- real-time operational signals from runtime logs/metrics.

2. Scheduled batch integrity checks
- analyzer-derived correctness metrics computed from captured log windows.
- these are not first-page signals; they are integrity health signals.

### Critical alerts (page)

1. Repeated stall on same table
- Condition:
  - `TABLE_STALLED` seen for a `tableId`, and
  - same `tableId` has another `TABLE_STALLED` within 2-5 minutes, or a paired `TABLE_STALLED_RECOVERY_REDRIVE`.
- Why: high confidence customer-visible freeze risk.

### High alerts (urgent but non-paging if after-hours)

2. First stall hit
- Condition: first `TABLE_STALLED` event for a `tableId` in a fresh window.
- Why: useful early warning, but too noisy to page immediately.

3. Recovery redrive activity
- Condition: `TABLE_STALLED_RECOVERY_REDRIVE` count > 0 in last 5m.
- Why: near-miss indicator, frequently precedes incidents.

4. Decision parity mismatch
- Condition: `ENGINE_PARITY_MISMATCH` count > 0 in last 15m
- Why: Decision authority/runtime divergence.

### Medium alerts (Slack)

5. Action rejection spike
- Condition: `actionRejected / max(handsStarted,1) > threshold` or event-rate threshold in 15m
- Recommended initial threshold: 5% equivalent

6. Queue pressure
- Condition: `queueDepthMax >= 5` for 3 consecutive metric emissions
- Why: Potential event loop pressure/backlog.

7. Throughput regression
- Condition:
  - `handsPerMinute` drops >50% vs rolling 24h baseline for >=10m, and
  - `handsStarted` in the same window is above a minimum floor.
- Recommendation: same-time-of-day baseline if available.
- Why: Silent degradation not always accompanied by explicit stalls.

### Scheduled batch integrity checks (non-paging by default)

Run every 15-60 minutes over captured logs:

1. `waitingHumanMissingDeadline`
2. `timeoutDoubleFires`
3. `deadlineOutsideWaiting`
4. `toActMismatchCount`
5. `handCompletionRate`
6. `timeoutWithMissingDeadline`
7. `waitingHumanNoNeedsAction`

Escalation policy:
- First failure: Slack summary with links to log window/artifacts.
- Repeated failures in consecutive windows: escalate to pager.

## Query Mapping Examples

## Datadog (log monitors)

Use JSON log parsing with attributes like `@msg`, `@tableId`, `@roomId`, `@stallReason`.

1. TABLE_STALLED (first-hit high severity)

```text
env:prod service:server @msg:"TABLE_STALLED"
```

2. TABLE_STALLED_RECOVERY_REDRIVE

```text
env:prod service:server @msg:"TABLE_STALLED_RECOVERY_REDRIVE"
```

3. ENGINE_PARITY_MISMATCH

```text
env:prod service:server @msg:"ENGINE_PARITY_MISMATCH"
```

4. DEALER_RUNTIME_METRICS queue pressure (logs-based)

```text
env:prod service:server @msg:"DEALER_RUNTIME_METRICS" @queueDepthMax:[5 TO *]
```

5. DEALER_RUNTIME_METRICS throughput drop (for dashboard formula)

```text
env:prod service:server @msg:"DEALER_RUNTIME_METRICS"
```

Then graph `avg(@handsPerMinute)` and compare against baseline monitor.

6. Heartbeat fail-safe (no gameplay progression)

```text
env:prod service:server @msg:"DEALER_RUNTIME_METRICS" @handsStarted:0 @activeTables:[1 TO *]
```

Trigger only when process health checks remain green for >5 minutes.

## Elastic / Kibana (KQL)

1. TABLE_STALLED

```text
msg : "TABLE_STALLED" and env : "prod"
```

2. TABLE_STALLED_RECOVERY_REDRIVE

```text
msg : "TABLE_STALLED_RECOVERY_REDRIVE" and env : "prod"
```

3. ENGINE_PARITY_MISMATCH

```text
msg : "ENGINE_PARITY_MISMATCH" and env : "prod"
```

4. Runtime metrics queue pressure

```text
msg : "DEALER_RUNTIME_METRICS" and queueDepthMax >= 5 and env : "prod"
```

5. Runtime metrics rejection pressure

```text
msg : "DEALER_RUNTIME_METRICS" and actionRejected > 0 and env : "prod"
```

## Dashboard Specification

Create one dashboard with four panels:

1. Stability
- `count(msg="TABLE_STALLED")`
- `count(msg="TABLE_STALLED_RECOVERY_REDRIVE")`

2. Throughput
- `avg(handsPerMinute)`
- `sum(handsStarted)` and `sum(handsCompleted)`

3. Timing/Queue health
- `avg(actionProcessMsMean)`
- `max(actionProcessMsMax)`
- `avg(queueDepthMean)`
- `max(queueDepthMax)`

4. Correctness/Parity
- `sum(decisionParityMismatch)`
- `sum(turnTimeoutFired)`
- `sum(actionRejected)` with `actionRejectedByCode` breakdown

5. Stall age / triage context
- Add and graph `stallAgeMs = now - lastSnapshotAt` (at stall event time).
- Add and graph `turnAgeMs = now - turnAssignedAtMs`.
- Optional future field: `actorWaitMs = now - actorAssignedAt`.

6. Turn pressure sanity
- `sum(waitingTurns)` and ratio `sum(waitingTurns)/sum(activeTables)`.

## Rollout Plan

### Phase 6A: Live observability

Ship now:

1. Live monitors for:
- `TABLE_STALLED`
- `TABLE_STALLED_RECOVERY_REDRIVE`
- `ENGINE_PARITY_MISMATCH`
- queue pressure
- action rejection spike
2. Grouping/dedup rules:
- `TABLE_STALLED` grouped by `tableId`
- `TABLE_STALLED_RECOVERY_REDRIVE` grouped by `tableId`
- `ENGINE_PARITY_MISMATCH` grouped by `decisionTraceId` (fallback `handId`)
- queue pressure alerts grouped by `service`
- action rejection alerts grouped by `service`
3. Event tagging requirement on top-level events:
- `env`, `service`, `buildSha`, `roomId`, `tableId`, `handId`
4. Keep first-hit stall as High (Slack), repeated stall as Critical (pager).

### Phase 6B: Scheduled integrity validation

1. Run analyzer windows every 15 minutes over the previous 20 minutes of logs.
2. Publish Slack summary with:
- invariant failures
- top offending `tableId`/`handId`
- links to artifacts
3. Escalation:
- 2 consecutive failing windows -> Slack incident thread
- 3 consecutive failing windows -> Pager escalation

### Phase 6C: Release discipline

1. Canary required.
2. Room soak required for relevant server changes.
3. Weekly alert precision/recall review.
4. Pre-deploy safety check (last 15m):
- block release if `TABLE_STALLED > 0`
- block release if `ENGINE_PARITY_MISMATCH > 0`
- block release if runtime `decisionParityMismatch > 0`

## Operational Runbook (Initial)

On `TABLE_STALLED`:

1. Filter logs by `tableId` and `handId`.
2. Inspect preceding `ENGINE_DECISION_STATE` and `ENGINE_DECISION` entries.
3. Check latest `DEALER_RUNTIME_METRICS` for `queueDepthMax`, `decisionParityMismatch`, `turnTimeoutFired`.
4. Run analyzer offline against captured log segment:

```powershell
pnpm --dir apps/server analyze:game-bugs --file <captured_log>
pnpm --dir apps/server analyze:phase4:gate -- --file <captured_log> --min-hand-completion-rate 0.95
```

On `ENGINE_PARITY_MISMATCH`:

1. Group by `decisionTraceId`, `tableId`, `handId`.
2. Compare `decisionStep` vs `runtimeStep` for first mismatch event.
3. Escalate as architecture risk even if no immediate stall occurred.

On periodic integrity failure (`waitingHumanMissingDeadline`, `timeoutDoubleFires`, etc.):

1. Identify failing window and affected `tableId`/`handId`.
2. Slice logs for that window and run:

```powershell
pnpm --dir apps/server analyze:game-bugs --file <captured_log>
pnpm --dir apps/server analyze:phase4:gate -- --file <captured_log> --min-hand-completion-rate 0.95
pnpm --dir apps/server analyze:canary -- --file <captured_log> --min-hands-started <floor> --min-hand-completion-rate 0.95
```

3. If failures repeat in consecutive windows, escalate to pager.

## CI/CD Alignment

Current workflows already run:

- PR: quick room soak + canary
- Nightly: full room soak + canary

Recommendation:

1. Keep `room-soak:validate:quick` mandatory on PRs touching engine/room/lifecycle.
2. Keep nightly full soak with artifact retention.
3. Maintain absolute log path usage in CI (`$GITHUB_WORKSPACE/var/logs/...`) to avoid path ambiguity.

## Success Criteria

Phase 6 is considered complete when all are true for 14 consecutive days in prod:

### Customer-visible SLO

1. `TABLE_STALLED == 0`
2. `ENGINE_PARITY_MISMATCH == 0`

### Integrity targets (batch analyzer)

3. `waitingHumanMissingDeadline == 0`
4. `timeoutDoubleFires == 0`
5. `toActMismatchCount == 0`
6. `deadlineOutsideWaiting == 0`

### Operational quality

7. Alert false-positive rate < 10%
8. Alert floods prevented by grouping/dedup policy

## Non-Goals

1. No authority flip or lifecycle model changes in this phase.
2. No reducer/driver-loop refactor in this phase.
3. No game-rule changes.

Observability first, architecture second.
### Field definitions (normative)

1. `stallAgeMs`
- Definition: `stallAgeMs = now - lastSnapshotAt`.
- If `lastSnapshotAt` is unknown, emit `-1`.

2. `turnAgeMs`
- Definition: `turnAgeMs = now - turnAssignedAtMs`.
- `turnAssignedAtMs` is the timestamp when `(handId, street, toActSeat, handActionSeq)` last changed.
- If no active turn exists, emit `0`.

3. `decisionTraceId`
- Correlation key linking `TABLE_STALLED` / `TABLE_STALLED_RECOVERY_REDRIVE` with:
  - `ENGINE_DECISION`
  - `ENGINE_RUNTIME_STEP`
  - `ENGINE_PARITY`
  - `ENGINE_PARITY_MISMATCH`
