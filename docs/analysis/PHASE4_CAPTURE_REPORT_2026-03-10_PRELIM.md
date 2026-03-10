# Phase 4 Capture Report (Preliminary)

Date: `2026-03-10`  
Owner: `engineering`  
Environment: `local capture files (pre-prod)`  
Window: `short sampled captures (not 24h, not 10k hands)`

## Scope

This is a preliminary comparison to validate analyzer plumbing and Phase 4 signals.
It is **not** the production go/no-go report.

Baseline file:

- `C:\wamp64\www\poker-champ\engine_decision_capture.log`

Current file:

- `C:\wamp64\www\poker-champ\engine_decision_bulk_capture.log`

Command used:

```bash
pnpm --dir apps/server analyze:phase4 -- --file ..\..\engine_decision_capture.log
pnpm --dir apps/server analyze:phase4 -- --file ..\..\engine_decision_bulk_capture.log
```

## Metric Comparison

| Metric | Baseline | Current | Delta | Notes |
|---|---:|---:|---:|---|
| handsStarted | 5 | 55 | +50 | larger sample in current |
| handsCompleted | 5 | 55 | +50 |  |
| handCompletionRate | 1.0000 | 1.0000 | 0 | healthy in both |
| avgActionsPerHand | 2.6000 | 3.2909 | +0.6909 | expected variance by sample mix |
| tableStalled | 0 | 0 | 0 |  |
| stallRecoveryRedrive | 0 | 0 | 0 |  |
| stalledPer1kHands | 0.00 | 0.00 | 0 |  |
| timeoutRuntimeCount | 0 | 0 | 0 |  |
| timeoutRuntimePer1kHands | 0.00 | 0.00 | 0 |  |
| timeoutDoubleFires | 0 | 0 | 0 | target met |
| timeoutWithMissingDeadline | 0 | 0 | 0 | target met |
| deadlineOutsideWaiting | 0 | 0 | 0 | target met |
| duplicateActionRejects | 0 | 0 | 0 |  |
| handIdMismatchRejects | 0 | 0 | 0 |  |
| decisionRuntimeMismatches | 0 | 0 | 0 |  |

## Additional Capture Notes

- `engine_decision_bot_capture.log` showed:
  - `handsStarted=8`
  - `handsCompleted=5`
  - `autoActionDiscarded=2`

This log likely ends mid-window and is not suitable as a Phase 4 gate sample by itself.

## Preliminary Assessment

Observed signals are consistent with healthy Phase 4 behavior in sampled logs:

1. No duplicate timeout executions.
2. No timeout without deadline.
3. No deadline leak outside waiting.
4. No decision/runtime divergence in sampled traces.

## Required Next Step (Gate)

Run the production/staging capture window and fill the full template:

- [PHASE4_CAPTURE_REPORT_TEMPLATE.md](C:\wamp64\www\poker-champ\docs\analysis\PHASE4_CAPTURE_REPORT_TEMPLATE.md)

Required gate sample size:

1. `>= 10k hands` or `24h` (whichever first).
2. Baseline vs current in same environment class.
3. GO/NO_GO decision recorded with owner.
