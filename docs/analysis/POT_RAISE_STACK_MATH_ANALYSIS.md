# Pot, Raise, and Stack Math Analysis

## Scope
This document analyzes how chip math currently flows through the server engine, where pot/stack drift can occur, and what safeguards now exist.

Primary code paths reviewed:
- `src/engine/dealer/services/ActionService.ts`
- `src/engine/dealer/services/SettlementService.ts`
- `src/engine/dealer/services/HandLifecycleService.ts`
- `src/engine/rules/SidePotManager.ts`
- `apps/client/src/stores/table.store.ts`
- `apps/client/src/realtime/tableRealtime.message.ts`

## Current Money Flow

### 1. Blinds
- Hand start posts SB/BB via `SettlementService.postBlind`.
- Posted amount is debited from stack and added to:
  - `player.roundBetCents`
  - `player.committedCents`
  - `state.potCents`

### 2. Player Actions
- `ActionService.execute` computes legal contribution per action:
  - `CALL`: contribution = `min(roundCurrentBet - player.roundBet, player.stack)`
  - `BET`: contribution = requested amount (clamped to stack)
  - `RAISE`: request interpreted as **raise-to** (`raiseTo`), contribution = `raiseTo - player.roundBet`
  - `ALL_IN`: contribution = full current stack
- Contribution is applied through `SettlementService.applyActionDebit`.

### 3. Street Progression
- `HandLifecycleService.advanceStreetOrShowdown` resets round state and advances turn/street.
- Pot is not reduced between streets (expected).

### 4. Showdown / Last Player
- Payout allocation comes from:
  - side-pot construction: `buildSidePots`
  - split logic: `splitPotCents`
- Winner credits are applied via `SettlementService.creditPayoutToPlayer`.

## Core Invariants in Place

### Transition-Level Money Invariant
- `assertMoneyConservationTransition` in `src/engine/invariants/assertMoneyConservation.ts`
- Called at:
  - blind posting
  - action debit
  - street settle transition
  - showdown payout
  - uncalled refund credit path

Checks include:
- non-negative stacks / bets / pot
- `pot >= sum(roundBetCents)` safety floor
- exact expected deltas for actor stack and round-bet when provided
- mass conservation across transitions (with disbursement tracking)

On failure, throws `BAD_STATE` with compact transition dump:
- event/action type, actor, street
- before/after stack + roundBet + pot
- `roundCurrentBetCents`, `minRaiseCents`, `toActSeat`

### Additional Guard
- `ALL_IN` hard guard in `ActionService`: all-in must end with `stackCents === 0`.

## Semantics Assessment ("to" vs "add")

### RAISE
- Server expects `amountCents` to be **raise-to**.
- Contribution is correctly derived as:
  - `raiseTo - player.roundBetCents`
- This is the correct and most important anti-drift behavior.

### BET
- Interpreted as direct contribution amount on unopened street.

### CALL
- Uses exact gap to current bet level (capped by stack).

### ALL_IN
- Uses full current stack contribution.

## Side Pot and Payout Notes

### Strengths
- Side-pot construction and split logic are deterministic and well-covered by tests.
- Randomized payout tests and all-in matrix tests currently pass.

### Risk Area
- `HandLifecycleService` contains a showdown remainder reconciliation fallback (`SHOWDOWN_REMAINDER_RECONCILED` warning path).
- This protects production continuity, but it can also mask a root side-pot/accounting issue if triggered.

## Client-Side Math Handling

### Finding
- Table client appears snapshot-driven for stack/pot rendering.
- No direct optimistic local stack/pot write path was found in:
  - table store
  - realtime inbound message handlers

### Implication
- Intermittent visual stack/pot anomalies are more likely server transition bugs (or out-of-order snapshot acceptance edge cases) than client-side optimistic math.

## Test Coverage Status

Existing or added deterministic coverage now includes:
- all-in zeroing stack and exact pot delta
- raise-to semantics
- uncalled return scenario
- all-in multiway matrices
- side-pot randomized payout suites

## Remaining Hardening Recommendations

1. Promote remainder reconciliation to strict mode in non-production.
- If payout sum mismatches pot at showdown in dev/test, throw immediately.

2. Add transition IDs to logs.
- Include monotonic transition id in every money invariant dump for easier replay.

3. Add one end-to-end conservation assertion per hand.
- At hand end, assert:
  - hand contributions == hand payouts (+ refunds)
  - no negative balances

4. Keep server as source of truth for chip math.
- Persistence should not be authoritative for live chip computation.
- Engine should compute; persistence should record/audit.

