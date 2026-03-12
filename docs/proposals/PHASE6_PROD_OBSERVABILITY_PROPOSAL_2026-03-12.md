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
  - Includes: `roomId`, `tableId`, `handId`, `stallReason`, `street`, `toActSeat`, `snapshotSeq`, `lastSnapshotAt`, `queueDepth`
- `TABLE_STALLED_RECOVERY_REDRIVE`
  - Includes: `roomId`, `tableId`, `handId`, `stallReason`
- `DEALER_RUNTIME_METRICS` (periodic)
  - Includes:
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

### Critical alerts (page)

1. Connected human deadline corruption
- Condition: `waitingHumanMissingDeadline > 0` in last 15m
- Why: Direct precursor to live hand hangs.

2. Timeout double fire
- Condition: `timeoutDoubleFires > 0` in last 15m
- Why: Can cause duplicate automation and invalid progression.

3. Hard stall detected
- Condition: `TABLE_STALLED` count > 0 in last 5m
- Why: Customer-visible freeze risk.

### High alerts (urgent but non-paging if after-hours)

4. Recovery redrive activity
- Condition: `TABLE_STALLED_RECOVERY_REDRIVE` count > 0 in last 5m
- Why: Near-miss indicator, frequently precedes incidents.

5. Decision parity mismatch
- Condition: `ENGINE_PARITY_MISMATCH` count > 0 in last 15m
- Why: Decision authority/runtime divergence.

### Medium alerts (Slack)

6. Action rejection spike
- Condition: `actionRejected / max(handsStarted,1) > threshold` or event-rate threshold in 15m
- Recommended initial threshold: 5% equivalent

7. Queue pressure
- Condition: `queueDepthMax >= 5` for 3 consecutive metric emissions
- Why: Potential event loop pressure/backlog.

8. Throughput regression
- Condition: `handsPerMinute` drops >50% vs rolling 24h baseline for >=10m
- Why: Silent degradation not always accompanied by explicit stalls.

## Query Mapping Examples

## Datadog (log monitors)

Use JSON log parsing with attributes like `@msg`, `@tableId`, `@roomId`, `@stallReason`.

1. TABLE_STALLED

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

## Rollout Plan

### Stage 1 (Immediate, 1 day)

1. Ship alert rules for Critical + High only.
2. Route Critical to pager, High to on-call Slack.
3. Confirm logs include environment tagging (`env`, `service`, `buildSha`).

### Stage 2 (48-72h)

1. Add Medium alerts after observing baseline noise.
2. Tune thresholds to reduce false positives.
3. Add runbook links in each alert.

### Stage 3 (1 week)

1. Add canary validation outputs to release checklist.
2. Enforce "no release if canary fails" policy.
3. Weekly review of alert precision/recall.

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

1. `TABLE_STALLED == 0`
2. `TABLE_STALLED_RECOVERY_REDRIVE == 0`
3. `ENGINE_PARITY_MISMATCH == 0`
4. `waitingHumanMissingDeadline == 0` (from periodic analyzer samples)
5. `timeoutDoubleFires == 0` (from periodic analyzer samples)
6. Alert false-positive rate < 10%

## Non-Goals

1. No authority flip or lifecycle model changes in this phase.
2. No reducer/driver-loop refactor in this phase.
3. No game-rule changes.

Observability first, architecture second.
