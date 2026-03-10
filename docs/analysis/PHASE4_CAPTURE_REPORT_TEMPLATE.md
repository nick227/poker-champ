# Phase 4 Capture Report Template

Date: `YYYY-MM-DD`  
Owner: `name`  
Environment: `prod | staging`  
Window: `start -> end`  
Hands target: `24h or >=10k hands`

## Commands

From repo root:

```bash
pnpm --dir apps/server analyze:phase4 -- --file <ABSOLUTE_OR_RELATIVE_LOG_PATH>
```

Note: with `--dir apps/server`, relative log paths resolve from `apps/server`. Use an absolute path to avoid ambiguity.

Example:

```bash
pnpm --dir apps/server analyze:phase4 -- --file C:\wamp64\www\poker-champ\engine_decision_capture.log
```

Optional one-command baseline vs current comparison:

```bash
pnpm --dir apps/server analyze:phase4:compare -- --baseline <baseline-log> --current <current-log>
```

## Inputs

- Baseline log file: `<path>`
- Current log file: `<path>`

## Analyzer Output (Baseline)

Paste analyzer summary block here.

## Analyzer Output (Current)

Paste analyzer summary block here.

## Metric Comparison

| Metric | Baseline | Current | Delta | Notes |
|---|---:|---:|---:|---|
| handsStarted |  |  |  |  |
| handsCompleted |  |  |  |  |
| handCompletionRate |  |  |  | target `~1.0` |
| avgActionsPerHand |  |  |  | derived from `ACTION_ACCEPTED / handsStarted` |
| tableStalled |  |  |  |  |
| stallRecoveryRedrive |  |  |  |  |
| stalledPer1kHands |  |  |  | should decrease materially |
| timeoutRuntimeCount |  |  |  |  |
| timeoutRuntimePer1kHands |  |  |  | context metric |
| timeoutDoubleFires |  |  |  | target `0` |
| timeoutWithMissingDeadline |  |  |  | target `0` |
| deadlineOutsideWaiting |  |  |  | target `0` |
| duplicateActionRejects |  |  |  | low/non-zero is normal under churn |
| handIdMismatchRejects |  |  |  | low/non-zero is expected under retries |

## Stall Reason Breakdown (Current)

Paste:

- `stallReasonBreakdown`
- `actionRejectedReasonBreakdown`

## Phase 4 Exit Gate

- [ ] No duplicate timeout execution (`timeoutDoubleFires == 0`)
- [ ] No missing-deadline timeout execution (`timeoutWithMissingDeadline == 0`)
- [ ] No deadline leak outside waiting state (`deadlineOutsideWaiting == 0`)
- [ ] Stall rate improved materially (`stalledPer1kHands` down vs baseline)
- [ ] Hand completion healthy (`handCompletionRate` close to `1.0`)

Decision: `GO | NO_GO`  
Decision owner: `name`  
Follow-ups:

1. `...`
2. `...`

## Post-Decision Actions

If `GO`:

1. Freeze Phase 4 logic (bugfix-only policy).
2. Move to Phase 5 completion (dedup guarantees + analyzer/CI gates).
3. Rate-limit or remove temporary `LIFECYCLE_PLAN_EXECUTED` logs.

If `NO_GO`:

1. File top defects from analyzer `issues`.
2. Add deterministic regression tests per defect.
3. Re-run capture after fixes.
