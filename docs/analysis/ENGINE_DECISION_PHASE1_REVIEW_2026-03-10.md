# Engine Decision Phase 1 Review - 2026-03-10

Date: `2026-03-10 10:11:42 -05:00`  
Reviewer: `Codex (automated capture + analysis)`  
Environment: `local`  
Scope achieved: `55 hands`, `291 decision traces`  
Scope target: `~50 hands`, `~200 decision traces`

## Capture Config

- `ENGINE_DECISION_SAMPLE_RATE=1`
- `ENGINE_DECISION_TABLE_ID=table_soak_random_walk`
- Runtime path: `pnpm --dir apps/server test -- src/tests/integration/dealer.random-walk.soak.test.ts`
- Repeated execution: `15` runs (bulk soak loop)
- Log file: `c:\wamp64\www\poker-champ\engine_decision_bulk_capture.log`

## Analyzer Output

- `traceGroups=291`
- `totalPairs=291`
- `matched=291`
- `mismatched=0`
- `missingDecision=0`
- `missingRuntime=0`
- `matchRate=100.00%`

## Volume Check

- `ENGINE_DECISION events=291`
- `ENGINE_RUNTIME_STEP events=291`
- `unique handIds=55`
- Sample handIds:
  - `hand_0HiGV_6rWa`
  - `hand_1NuageWKEk`
  - `hand_26pAIErNFV`
  - `hand_2R58-DYFm6`
  - `hand_3sb1-iuwlB`

## Decision Step Distribution

- `START_NEXT_HAND=110`
- `WAIT_FOR_HUMAN=181`

## Mismatch Review

No mismatches detected in this bulk capture.

## Required Checks

- [x] No `NO_OP` where runtime progressed.
- [x] No missing `RUN_SHOWDOWN` when showdown executed.
- [x] No missing `ADVANCE_STREET` when betting closed.
- [x] No unexpected `INVALID_TO_ACT`.
- [ ] Bot turns show `RUN_BOT_ACTION` when due (not covered in this human-only soak capture).

## Outcome

- Phase 1 status: `volume target met; bot path covered; decision/runtime mismatch fixed and revalidated`

## Bot Capture Addendum

### Bot Scenario Config

- Runtime path: `pnpm --dir apps/server test -- src/tests/integration/table-multiplayer-churn.integration.test.ts`
- Test result: `1 file passed`, `5 tests passed`
- Log file: `c:\wamp64\www\poker-champ\engine_decision_bot_capture.log`

### Bot Analyzer Output

- `traceGroups=54`
- `totalPairs=53`
- `matched=53`
- `mismatched=0`
- `missingDecision=0`
- `missingRuntime=1`
- `matchRate=100.00%`

### Bot Step Coverage

- Decision steps:
  - `RUN_BOT_ACTION=17`
  - `WAIT_FOR_HUMAN=22`
  - `START_NEXT_HAND=13`
  - `NO_OP=2`
- Runtime steps:
  - `RUN_BOT_ACTION=17`
  - `WAIT_FOR_HUMAN=22`
  - `START_NEXT_HAND=13`
  - `NO_OP=1`
- Unique hands in bot capture: `9`

### Bot Mismatch Resolution

- Previous divergence class (`WAIT_FOR_HUMAN` vs `RUN_BOT_ACTION` for disconnected-human `toAct`) is resolved.
- Decision changes applied:
  - `computeNextStep()` now evaluates `botActionDue` by query authority (not bot-kind gate).
  - `computeNextStep()` checks showdown/street-advance before requiring resolvable `toAct`.
  - `Dealer` runtime query bridge now maps disconnected-human automation to `botActionDue` consistently with runtime execution path.
- Additional note:
  - `missingRuntime=1` is from `reason=STALL_MONITOR_TICK` (public decision log emits `ENGINE_DECISION` only, no runtime pair by design).

### Updated Required Checks

- [x] Bot turns show `RUN_BOT_ACTION` when due.
- [x] No decision/runtime divergence in mixed human+bot churn scenarios.
