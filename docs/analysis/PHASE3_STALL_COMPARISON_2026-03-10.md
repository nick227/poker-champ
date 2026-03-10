# Phase 3 Stall Comparison - 2026-03-10

Date: `2026-03-10 10:45:33 -05:00`  
Scope: `table-multiplayer-churn` integration suite, 5 runs per mode

## Inputs

- Before (legacy heuristic):
  - `FEATURE_DECISION_STALL_DETECTION=false`
  - Log: `C:\wamp64\www\poker-champ\stall_legacy_agg.log`
- After (decision-authority):
  - `FEATURE_DECISION_STALL_DETECTION=true`
  - Log: `C:\wamp64\www\poker-champ\stall_decision_agg.log`

## Analyzer

- Script:
  - `apps/server/scripts/analyze-stall-comparison.mjs`
- Command:
  - `node apps/server/scripts/analyze-stall-comparison.mjs --before C:\wamp64\www\poker-champ\stall_legacy_agg.log --after C:\wamp64\www\poker-champ\stall_decision_agg.log`

## Results

- Before:
  - `TABLE_STALLED=0`
  - `TABLE_STALLED_RECOVERY_REDRIVE=0`
  - `handStarts=40`
  - `stalledPer1kHands=0.0000`
- After:
  - `TABLE_STALLED=0`
  - `TABLE_STALLED_RECOVERY_REDRIVE=0`
  - `handStarts=40`
  - `stalledPer1kHands=0.0000`
- Delta:
  - `delta_TABLE_STALLED=0`
  - `delta_REDRIVE=0`
  - `delta_stalledPer1kHands=0.0000`

## Interpretation

- No regression observed with decision-based stall detection enabled.
- This test workload did not generate stalled states, so it validates safety but not reduction magnitude.

## Next Production/Staging Step

- Run the same analyzer over real traffic windows (before vs after flag flip) to measure actionable reductions and stall-reason distribution:
  - `TABLE_STALLED` rate
  - `TABLE_STALLED_RECOVERY_REDRIVE` rate
  - `stallReason` breakdown (`INVALID_TO_ACT`, `BOT_OVERDUE`, `TURN_TIMEOUT_OVERDUE`, `STREET_ADVANCE_OVERDUE`, `SHOWDOWN_OVERDUE`)
