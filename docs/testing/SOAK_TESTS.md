# Soak Tests

This document explains how the poker soak tests actually work today, what they are asserting, and how to run them.

## Purpose

Our soak tests are not just "long tests."

They are stress tests for engine progression, timeout ownership, lifecycle completion, and payout correctness under churn. Their main job is to catch:

- deadlocks
- livelocks
- missing turn ownership
- stale queued work mutating newer state
- timeout or reconnect races
- payout conservation bugs

They do this by driving the engine through many hands with randomized or concurrent activity while asserting invariants continuously.

## Main Soak Tests

There are two primary soak layers.

### 1. Single-table dealer random walk soak

File:
[dealer.random-walk.soak.test.ts](/c:/wamp64/www/poker-champ/apps/server/src/tests/integration/dealer.random-walk.soak.test.ts)

This is the lower-level engine soak. It runs directly against `Dealer` and `PokerState` without going through room/websocket plumbing.

It simulates:

- repeated hand starts
- randomized legal player actions
- disconnect/reconnect churn
- all-in and showdown paths
- stack recycling when too few players have chips left

Its core assertions are:

- hands continue to start and complete
- actionable turns always remain valid enough to progress
- chip mass is conserved
- per-hand contributions match payouts/refunds
- the engine does not silently stall between hands or inside a hand

### 2. Multi-table room soak

File:
[poker-room.multitable.soak.test.ts](/c:/wamp64/www/poker-champ/apps/server/src/rooms/poker-room.multitable.soak.test.ts)

This is the higher-level integration soak. It runs multiple `PokerRoom` instances concurrently and drives them through live room flows.

It simulates:

- one human plus one bot per table
- concurrent tables progressing at the same time
- repeated hand completions
- automatic stack recycling and forced next-hand progression
- snapshot-driven action loops through the room boundary

Its core assertions are:

- tables continue completing hands
- no room goes quiet for too long while active
- no table remains stuck without hand completion
- room-level concurrency does not introduce stalls

## How The Single-Table Soak Works

### Test shape

The test creates:

- a fresh `PokerState`
- 3 human players with equal starting stacks
- a `Dealer`
- fake persistence hooks that record contributions and payouts

Those persistence hooks are important. They turn the soak into an accounting test as well as a progression test.

### Hand loop

For each hand:

1. Players are recycled if too few still have chips.
2. The test asserts the table is cleanly in `WAITING`.
3. It starts a new hand.
4. It repeatedly inspects current action options and sends a random legal action.
5. It injects random disconnect/reconnect churn during the hand.
6. It watches for completion and verifies settlement.

The random action picker is still constrained to legal actions from `ActionOptionsService`, so this is randomized valid play, not random invalid traffic.

### What it checks during the hand

The test continuously checks that the engine is still making progress.

Examples:

- a hand must move out of `WAITING`
- snapshots or state fields must keep changing
- a to-act player must remain actionable enough for the hand to continue
- the test trace cannot grow forever without meaningful progression

If the engine stops moving, the test fails with a trace that shows the last progression events.

### Disconnect/reconnect churn

The single-table soak intentionally flips player connectivity during play.

This is there to surface bugs in:

- turn deadline ownership
- auto-fold / auto-check behavior
- stale timeout callbacks
- stale queued internal actions
- reconnect recovery

This is why soak failures often expose bugs that ordinary happy-path tests miss.

### Payout conservation

For each hand, the test tracks:

- blind postings
- betting debits
- refunds
- payouts

At hand end it verifies:

- per-hand contribution totals equal payout/refund totals
- overall chip mass remains conserved

That makes the soak useful for catching settlement bugs, not just progression bugs.

## How The Multi-Table Soak Works

### Test shape

The multitable soak creates several `PokerRoom` instances in parallel.

Each table gets:

- one fake human client
- one bot
- normal room join flow
- snapshot delivery through the room client boundary

Each worker then loops until its table completes the configured number of hands.

### Worker behavior

Each table worker:

- waits for initial seating and first hand start
- reads the latest `TABLE_SNAPSHOT`
- chooses a legal human action from snapshot action options
- lets the bot act automatically
- tracks room progress and hand completion timestamps
- recycles stacks if the table would otherwise die out

This makes it closer to real room behavior than the direct dealer soak.

### Progress budgets

The multitable soak does not just wait forever.

It uses time budgets based on current table state:

- if a hand is active, room progress must continue within a bounded time
- if a human deadline is active, progress can wait until near that deadline
- if nothing completes for too long, the worker throws

This is how it catches real stalls rather than only final failures.

## Validation Script

File:
[run-multitable-soak-validation.mjs](/c:/wamp64/www/poker-champ/apps/server/scripts/run-multitable-soak-validation.mjs)

This script is a wrapper around the multitable soak.

It:

1. runs the multitable soak test
2. captures the log file
3. runs several log analyzers
4. fails if key canaries appear

It specifically checks for:

- `TABLE_STALLED`
- `TABLE_STALLED_RECOVERY_REDRIVE`
- `UNOWNED_ACTIVE_HAND`
- excessive action rejection rate
- poor hand completion rate

So this wrapper is not only "did the test process exit cleanly." It is also a log-based quality gate.

## Environment Variables

### Single-table dealer soak

Common env knobs:

- `SOAK_HANDS`
- `SOAK_PROGRESS_EVERY`
- `SOAK_TEST_TIMEOUT_MS`
- `SOAK_PROFILE`
- `SOAK_HEARTBEAT_FILE`

Behavior:

- `SOAK_HANDS` controls how many hands to run
- `SOAK_PROGRESS_EVERY` controls progress logging cadence
- `SOAK_TEST_TIMEOUT_MS` sets the Vitest timeout for the long-running hand loop
- `SOAK_PROFILE=nightly` increases the default hand count/timeout profile
- `SOAK_HEARTBEAT_FILE` writes progress JSON lines while the soak runs

### Multi-table soak

Common env knobs:

- `MULTI_TABLE_SOAK_TABLES`
- `MULTI_TABLE_SOAK_HANDS_PER_TABLE`
- `MULTI_TABLE_SOAK_PROGRESS_EVERY`
- `MULTI_TABLE_SOAK_MAX_RECYCLES_PER_TABLE`

Validation wrapper knobs:

- `MULTI_TABLE_SOAK_VALIDATION_RUNS`
- `PHASE4_MIN_HAND_COMPLETION_RATE`
- `MULTI_TABLE_SOAK_MAX_REJECTION_RATE`

## Typical Commands

### Run the single-table soak

```powershell
pnpm --dir C:\wamp64\www\poker-champ exec vitest run apps/server/src/tests/integration/dealer.random-walk.soak.test.ts
```

### Run the single-table soak with custom hand count and timeout

```powershell
$env:SOAK_HANDS='200'
$env:SOAK_TEST_TIMEOUT_MS='600000'
pnpm --dir C:\wamp64\www\poker-champ exec vitest run apps/server/src/tests/integration/dealer.random-walk.soak.test.ts -t "plays many hands without deadlock and preserves per-hand payout conservation"
```

### Run the multitable soak

```powershell
pnpm --dir C:\wamp64\www\poker-champ exec vitest run apps/server/src/rooms/poker-room.multitable.soak.test.ts -t "runs concurrent tables without stalls"
```

### Run the multitable validation wrapper

```powershell
node C:\wamp64\www\poker-champ\apps\server\scripts\run-multitable-soak-validation.mjs --runs 1 --tables 4 --hands-per-table 30
```

## What A Soak Failure Usually Means

### Timeout

If the soak times out, that does not automatically mean the engine is deadlocked.

It can mean:

- the test timeout is too small for the configured hand count
- the engine is making progress but too slowly
- the test is waiting on an overly narrow condition

This is why we now explicitly wire `SOAK_TEST_TIMEOUT_MS` into the long single-table soak.

### Progress assertion failure

If the soak reports no progress, that usually means:

- no valid turn owner
- no deadline armed
- stale queued work re-entering the wrong hand
- lifecycle progression failed to move the table forward

These are the high-value failures.

### Payout conservation failure

If contribution and payout totals diverge, the bug is usually in:

- settlement
- refund handling
- side-pot distribution
- terminal hand cleanup

## What The Soaks Do Not Guarantee

They are very useful, but they are not formal proofs.

They do not guarantee:

- every race is covered
- every client-visible ordering is correct
- every snapshot contract detail is perfect
- every room boundary path is deterministic

That is why we still need:

- focused regression tests
- broadcast contract tests
- lifecycle tests
- client reconciliation tests

## Practical Reading Of Results

When a soak passes, the strongest conclusion is:

- the system can survive extended randomized churn without obvious stall or accounting failure in that configuration

When a soak fails, the most useful artifacts are:

- the failure trace from the test
- dealer/runtime logs
- canary logs such as `UNOWNED_ACTIVE_HAND`
- heartbeat/progress output

Those usually point closer to the real bug than the final timeout line by itself.

## Current Recommendation

Use the soaks in two ways:

- locally, as targeted reproduction tools while hardening engine progression
- in validation runs, as regression gates for stall-related fixes

Treat them as operational stress tests with assertions, not just long-running unit tests.
