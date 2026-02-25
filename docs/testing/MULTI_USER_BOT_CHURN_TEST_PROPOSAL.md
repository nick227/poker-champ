# Multi-User + Bot Join/Leave Stress Test Proposal

Date: 2026-02-25
Owner: Backend + Realtime + Client QA

## Goal
Increase confidence that complex seat churn (humans and bots joining/leaving/sitting out/rejoining) never causes:
- crashes,
- deadlocked hands,
- premature or missing hand termination,
- money/invariant drift.

## Global Invariant Contract (applies to every churn test)
- No deadlocks/timeouts (each hand reaches a terminal state within bounded time).
- No negative money values (`stackCents >= 0`, `potCents >= 0`).
- Per-hand settlement conservation: `sum(payoutsByUserId) == potCents`.
- `toActSeat` always resolves to an eligible acting player while hand is active.
- Snapshot stream is monotonic (`snapshotSeq`/`snapshotId` strictly progresses).

## Current Harness Review

### Existing strengths
- Fast deterministic server harnesses with strong poker-rule coverage:
  - `src/tests/dealer.allin.matrix.6max.test.ts`
  - `src/tests/fold-path-equivalence.test.ts`
  - `src/tests/player-lifecycle.removal-bet-sync.test.ts`
  - `src/tests/dealer.random-walk.soak.test.ts`
  - `src/tests/dealer.fuzz.random-actions.test.ts`
- Room-level integration for join/action/disconnect behavior:
  - `src/tests/table-action-broadcast.test.ts`
  - `src/tests/table-join.guard.test.ts`
  - `src/tests/session-policy.test.ts`
- Headless real-server orchestration script already exists:
  - `scripts/headless-two-client.ts` (actually 3 participants, includes side-pot + reconnect checks)
- Playwright two-browser baseline e2e:
  - `apps/client/e2e/two-player-stack-consistency.spec.ts`

### Main gaps for your reported issue
- No dedicated "seat churn matrix" test suite that repeatedly mixes:
  - humans + bots,
  - join/leave during active streets,
  - sit-out/pass-next-hand,
  - immediate joiners being dealt in next hand.
- No explicit regression matrix for "fold detection ends hand correctly" under concurrent churn.
- Existing headless harness validates one rich path, but not a broad scenario battery with case IDs and repeatability.
- CI gate still emphasizes a narrow subset by default (`test:server:core`), so many high-value churn scenarios are not strict merge blockers.

## Proposed Test Battery

### Layer A: Deterministic rule and lifecycle matrix (server, fast)
Create a new suite group, e.g. `src/tests/multiplayer.churn.matrix.test.ts`.

Test IDs and intent:
- `CHURN-A01`: heads-up fold always transitions to terminal hand state (`HAND_END` or equivalent) and advances/awaits next hand correctly.
- `CHURN-A02`: 3-way hand where one player folds, one all-ins, one calls; verify no early hand end before required resolution.
- `CHURN-A03`: disconnected to-act user auto-fold/auto-check path is equivalent to manual fold/check for pot/commitment results.
- `CHURN-A04`: highest current bettor folds; `roundCurrentBetCents` re-syncs and next actor remains valid.
- `CHURN-A05`: `ABANDONED` player reconnects mid-hand; remains out of current hand action eligibility.
- `CHURN-A06`: player marked `sittingOutUntilNextHand` is skipped for current hand and re-eligible only on next deal.
- `CHURN-A07`: newly added bot mid-hand is not in current hand and is dealt next hand.
- `CHURN-A08`: newly joined human mid-hand follows same next-hand deal-in rule as bot.

Core assertions in every case:
- No invariant exceptions (`assertStateInvariants`).
- No negative stack/pot values.
- Per-hand payout sum equals pot.
- `toActSeat` always points to eligible `ACTIVE` player while hand is active.
- No deadlocks/timeouts.
- Monotonic snapshot progression when snapshot emission is part of the scenario.

### Layer B: PokerRoom multi-client orchestration matrix (integration)
Create `src/tests/table-multiplayer-churn.integration.test.ts`.

Participants: 2 humans + 2 bots baseline; support 6-max variant.

Test IDs:
- `CHURN-B01`: human leaves while to-act, auto-action resolves, hand completes, no deadlock.
- `CHURN-B02`: user returns before deadline (`SESSION_RESTORED`) and cannot illegally act if out of current hand.
- `CHURN-B03`: user exceeds auto-action cap, is marked sitting out/abandoned, table continues.
- `CHURN-B04`: sequential join order stress (H1 join, Bot1 join, H2 join, Bot2 join) while hand in progress; only next hand includes newcomers.
- `CHURN-B05`: late joiner buys in and is shown seated but not dealt until legal boundary.
- `CHURN-B06`: repeated fold-heavy rounds under churn do not stall in non-`WAITING` state.
- `CHURN-B07`: remove an all-in participant via lifecycle path; bets and round state stay synchronized.

Validation additions:
- Capture snapshot reason transitions per hand (`ACTION_ACCEPTED`, `RUNOUT_STAGE`, `HAND_END`, etc.).
- Assert monotonic `snapshotId`/sequence and hand number progression.
- Assert every hand eventually reaches terminal state within timeout.
- Enforce payout conservation and no-negative-money checks in each scenario.

### Layer C: Headless stress scenario runner (script-level)
Extend `scripts/headless-two-client.ts` into a scenario runner, e.g. `scripts/headless-multiplayer-churn.ts`.

Required capabilities:
- Deterministic seed.
- Scenario list + repeat count (`--scenario`, `--iterations`, `--seed`).
- Participant profiles (human, passive bot, aggressive bot, short-stack bot).
- Action policy forcing edge patterns (fold storms, all-in clusters, disconnect bursts).

Scenarios:
- `CHURN-C01 fold-storm`: many consecutive folds with intermittent joins/leaves.
- `CHURN-C02 allin-ladder`: short stack all-in, deep stack raise/call, player disconnect/reconnect during runout.
- `CHURN-C03 seat-pass-rotation`: multiple sit-outs and reactivations across consecutive hands.
- `CHURN-C04 join-leave-thrash`: rapid join/leave around hand boundaries to expose timing bugs.
- `CHURN-C05 mixed-human-bot endurance`: N hands with random legal actions plus controlled churn events.

Pass criteria:
- Zero crashes/exceptions.
- Zero deadlocks (guard timeout not hit).
- Money conservation per hand and across run.
- No hand skipped into invalid street state.
- Snapshot/hand progression remains monotonic.

### Layer D: UI/E2E confidence checks (Playwright)
Add one focused multi-user browser test for seat/deal-in semantics (not full engine fuzz).

Test IDs:
- `CHURN-D01`: third player joins during active hand and is visibly seated but only receives actionable controls on next hand.
- `CHURN-D02`: disconnected user returns; UI reflects restore state without duplicate active-turn controls.
- `CHURN-D03`: fold-ending hand updates banner/state and next-hand countdown consistently for all clients.

## Specific Early-End/Fold Detection Regression Set
Add a dedicated file: `src/tests/hand-end-fold-detection.regression.test.ts`.

Minimum cases:
- `FOLD-R01`: heads-up, to-act folds preflop -> immediate terminal hand result with correct winner.
- `FOLD-R02`: 3-way, non-final player folds -> hand must continue.
- `FOLD-R03`: last eligible actor folds after prior all-in(s) -> hand end reason and payouts consistent.
- `FOLD-R04`: forced fold (abandon) and auto-fold (disconnect) produce same terminal behavior as manual fold.
- `FOLD-R05`: fold while pending reconnect event does not fire duplicate hand-end transitions.

## CI and Execution Proposal

### New scripts
- `test:server:churn:matrix` -> Layer A + fold regression.
- `test:server:churn:integration` -> Layer B.
- `harness:headless:churn` -> Layer C scenarios (quick profile for PR, long profile nightly).
- `test:client:e2e:churn` -> Layer D.

### Gate policy
- PR required (blocking): Layer A churn matrix + Layer B churn integration.
- Pre-release required (blocking): Layer A + Layer B + Layer C headless churn + Layer D e2e churn.
- Nightly required (blocking): long-run Layer C stress profile plus Layer D churn e2e smoke.

## Implementation Order
1. Add `FOLD-R*` regression file first (directly targets your current failure mode).
2. Add Layer A matrix suite with deterministic hand-state assertions.
3. Add Layer B room-level churn integration suite.
4. Upgrade headless script into parameterized scenario runner (Layer C).
5. Add focused Playwright churn checks (Layer D).
6. Wire new scripts into `verify`/release gates.

## Success Criteria
- Reproducible proof that mixed human/bot churn cannot trigger crash or deadlock in covered scenarios.
- Explicit coverage of all-ins, folds, sit-out/pass, join-now/deal-next-hand behavior.
- Early hand-end detection behavior is locked by dedicated regression tests.
