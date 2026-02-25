# Headless Churn Soak Guide

Date: 2026-02-25  
Owner: Engine + Realtime QA

## Purpose
This guide explains how to run long churn soaks with:

- `strict` mode (fail fast on invariant/diagnostic violations)
- `collect` mode (continue run, aggregate findings)

It also documents what `harness:headless:churn` does and how to extend it safely.

## What `harness:headless:churn` Does

Command entrypoint:

```bash
pnpm harness:headless:churn
```

Script:

- `scripts/headless-multiplayer-churn.ts`

Behavior summary:

1. Starts a local Colyseus game server and creates a poker room.
2. Joins managed human clients (`u1..u4`) and adds bots per scenario.
3. Drives legal actions from snapshot action options.
4. Applies churn events (join/leave/rejoin) during and between hands.
5. Enforces shared invariants (money, actionable `toActSeat`, snapshot monotonicity).
6. Captures diagnostics and event timeline.
7. On failure, writes reproducible artifacts under:
   - `artifacts/churn-repro/<tableId_timestamp>/`
   - `events.jsonl`
   - `diagnostics.jsonl`
   - `violation.json`

## Modes: `strict` vs `collect`

### Strict mode

- Flag: `--invariant-mode=strict`
- Intended for PR/pre-release confidence gates.
- Behavior:
  - First critical finding fails the run.
  - Denylist diagnostics are treated as failures.
  - Repro artifact is written immediately.

Use when you want:

- fast signal
- deterministic red/green gate
- immediate failure localization

### Collect mode

- Flag: `--invariant-mode=collect`
- Intended for long/nightly endurance.
- Behavior:
  - Continues longer and accumulates findings.
  - Still writes artifacts on terminal failure.
  - Better for spotting intermittent patterns over many hands.

Use when you want:

- trend visibility
- broader soak coverage
- non-blocking triage context

## Recommended Run Profiles

### Local fast confidence

```bash
pnpm harness:headless:churn --scenario=endurance --hands=12 --iterations=3 --invariant-mode=strict
```

### Local bounded long run

```bash
pnpm harness:headless:churn --scenario=endurance --hands=40 --iterations=2 --invariant-mode=collect
pnpm harness:headless:churn --scenario=endurance --hands=40 --iterations=2 --invariant-mode=strict
```

### Nightly soak

```bash
pnpm harness:headless:churn --scenario=endurance --hands=40 --iterations=10 --invariant-mode=collect
pnpm harness:headless:churn --scenario=endurance --hands=40 --iterations=10 --invariant-mode=strict
```

## Core CLI Flags

- `--scenario=<fold-storm|allin-ladder|join-leave-thrash|endurance>`
- `--seed=<number>`
- `--hands=<number>`
- `--iterations=<number>`
- `--invariant-mode=<strict|collect>`

Example:

```bash
pnpm harness:headless:churn --scenario=join-leave-thrash --seed=20260225 --hands=20 --iterations=3 --invariant-mode=strict
```

## Failure Signals to Watch

High-priority diagnostics:

- `QUEUED_AUTO_ACTION_FAILED`
- `QUEUE_RECOVERY_AFTER_FAILURE`
- `ACTION_FAILED`

Invariant classes:

- `BETTING_INVARIANT_VIOLATION` (actor-election / actionability mismatch)
- payout sum mismatch (`sum(payoutsByUserId) !== potCents`)
- money conservation drift
- actionable stall (`STALL_NO_ELIGIBLE_ACTOR`)

## How to Triage a Failure

1. Open latest `violation.json`.
2. Check:
   - `cause`
   - `stateDigest`
   - `firstActionableInvalid`
   - `digestDeltaFromPrevious`
3. Inspect:
   - filtered `lastDiagnostics` (QUEUE / ACTION / LIFECYCLE)
   - tail of `lastEvents` (typically last 50-60 events)
4. Confirm whether failure source is:
   - harness behavior
   - queue/turn-atomicity
   - lifecycle mutation
   - settlement/payout path
5. Convert to deterministic regression before broad engine refactors.

## Dev Notes: Using the Harness Safely

- Do not dispatch actions outside actionable phases.
- Actor resolution must remain server-authoritative:
  - `toActSeat`
  - player `status === ACTIVE`
  - player `needsAction === true`
- Prefer hand completion tracking from `lastHandResult.handId` over hand-id transition assumptions.
- Keep strict/collect semantics consistent; avoid silent mode drift.
- Keep diagnostic matching type-based, not log-string-based.

## Dev Notes: Extending Scenarios

When adding a scenario:

1. Keep it deterministic by seed.
2. Use legal action options from snapshots (never hardcode illegal actions).
3. Keep churn events at known boundaries unless intentionally fault-injecting.
4. Reuse invariant helpers (`churnInvariantContract`) instead of custom local checks.
5. Add a clear scenario intent comment (what race/edge it probes).

When adding a new invariant:

1. Add it in the shared invariant contract.
2. Run it in matrix/integration/headless consistently.
3. Ensure strict mode fails and collect mode records.

## CI/Nightly Integration Notes

Recommended split:

- PR gate: short strict profile only.
- Pre-release: strict + collect bounded profiles.
- Nightly: long strict + collect soaks with artifact upload (`artifacts/churn-repro/**`).

Always upload artifacts even on success/failure boundaries to preserve triage context.

## Known Good Baseline (Current)

Validated baseline after queue round-closure fix:

- `dealer.auto-action-warning.regression.test.ts` passes.
- `endurance 12x3 strict` passes.
- `endurance 40x2 collect` passes.
- `endurance 40x2 strict` passes.

If this baseline regresses, treat it as engine-level until disproven by artifact evidence.
