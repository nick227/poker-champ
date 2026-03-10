# Engine Decision Phase 1 Review Template

Date: `<YYYY-MM-DD>`  
Reviewer: `<name>`  
Environment: `<local|staging|prod>`  
Scope: `~50 hands`, `~200 decision traces` (target)

## Capture Config

- `ENGINE_DECISION_SAMPLE_RATE=<value>`
- `ENGINE_DECISION_TABLE_ID=<value or blank>`
- Test/runtime path: `<command or service>`
- Log file: `<path>`

## Analyzer Output

- `traceGroups=<n>`
- `totalPairs=<n>`
- `matched=<n>`
- `mismatched=<n>`
- `missingDecision=<n>`
- `missingRuntime=<n>`
- `matchRate=<pct>`

## Volume Check

- `ENGINE_DECISION events=<n>`
- `ENGINE_RUNTIME_STEP events=<n>`
- `unique handIds=<n>`

## Mismatch Review

List representative mismatches (or state none).

1. `trace=<id>` `handId=<id>` `street=<street>`  
   `decisionStep=<step>` `runtimeStep=<step>`  
   assessment: `<expected|unexpected>`  
   action: `<none|open defect>`

2. ...

## Required Checks

- [ ] No `NO_OP` where runtime progressed.
- [ ] No missing `RUN_SHOWDOWN` when showdown executed.
- [ ] No missing `ADVANCE_STREET` when betting closed.
- [ ] No unexpected `INVALID_TO_ACT`.
- [ ] Bot turns show `RUN_BOT_ACTION` when due.

## Outcome

- Phase 1 status: `<pass|needs fixes>`
- Open defects:
  - `<defect id / summary>`
- Next step:
  - `<proceed to phase 2>` or `<fix and re-run capture>`

