# Stuck-Hand Recovery — Design (post-MVP, not implemented)

**Status:** Parked. The bounded retry/circuit-breaker fix (`Dealer.ts`, `TurnAutomationService.ts`)
already prevents the catastrophic failure mode this document is about — a stuck hand causing
runaway retries that starve the server. That shipped. This document describes what would need to
be built if a stuck hand's *economic* state (chips still committed to a hand that can never
resolve) turns out to need automatic recovery, i.e. if this fault is observed happening often
enough in production to justify the machinery below. Build only when that's true.

## Background

Observed 2026-08-20 in local dev: a bot's scheduled action repeatedly failed with a Prisma P2003
foreign-key violation because the `Hand` row it referenced no longer existed in the DB (dev DB
reset while a table's `Dealer` instance was mid-hand in memory). The failure handler rescheduled
the same doomed action on every failure, looping every 200–900ms indefinitely — the actual
incident (nonstop server "chatter").

Fixed for MVP: `Dealer.ts` now trips a circuit breaker after `MAX_CONSECUTIVE_BOT_ACTION_FAILURES`
(3) repeats of the same failure for the same `(handId, street, botId, action)`, logs
`BOT_SCHEDULED_ACTION_CIRCUIT_BREAKER_TRIPPED`, and **stops retrying**. Same pattern applied to
`TurnAutomationService.maybeActForBot()`'s unbounded `queueMicrotask` retry (bounded, timer-backed,
loud diagnostic on trip). Neither path invents an action, a winner, or a pot outcome — the hand
just stops making progress and stays visibly wedged, which is intentional: better a silent hang
than a corrupted resolution.

What's *not* handled: the hand itself never advances. Any chips already committed to it stay
frozen — fine for a throwaway dev hand, not fine if this ever happens to a table with a real
player's money in the pot. That's what this document designs for.

## Core invariant

If the engine reaches a state where it cannot continue a hand deterministically, **never invent an
action, a winner, or a pot allocation.** Recovery moves the hand to an explicit terminal recovery
state and restores chips from authoritative ledger facts only — never from `PokerState`, current
stacks, or seat assumptions.

## The two ledgers (why this is tractable)

- **Pot ledger** — `PlayerBalance` / `BalanceTransaction` (`packages/db/prisma/schema.prisma`),
  written exclusively through `LedgerService` (`apps/server/src/engine/persistence/LedgerService.ts`).
  Every blind, bet, call, raise, refund, and payout is a signed `BalanceTransaction` row scoped to
  `handId`, with a deterministic `externalRef` enforcing idempotency (P2002-catch makes
  re-application a no-op). `HandAction`/`HandPayout` are *not* authoritative for money — they're
  the display/audit history, and the thing that broke in the original incident.
- **Side-bet ledger** — `PlayerInteraction` rows, resolved through `PlayerInteractionService`.
  Side-bet chips move **only at resolution** (`resolveSideBetsForHand`'s `CashierService`
  debit/credit calls), never at propose/accept. An `ACTIVE` side bet tied to a stuck hand has
  moved zero money — voiding it is a pure status flip, no ledger reversal needed. (The small,
  already-shipped piece of this: `PlayerInteractionService.voidSideBetsForHand(tableId, handId,
  reason)` — force-voids ACTIVE side bets for a hand. Not wired into anything yet; there's no
  admin void-hand action to call it from today.)

## Open design questions, answered

**1. Stuck vs. retryable.** Auto-recovery should trigger on a narrow signature: repeated failures
against the *same* `handId`, whose error is structurally permanent — a Prisma P2003 where
`meta.field_name` implicates `Hand`/`handId` (the referenced row provably doesn't exist), observed
past a circuit-breaker streak. Explicitly not a trigger: a single failure; failures that stop
repeating; `AUTOMATION_NO_PLAYER_AT_SEAT_CIRCUIT_BREAKER_TRIPPED` (different fault class — in-memory
seat-mapping corruption, ledger may be fine, forcing a void could be wrong); failures spanning
*different* `handId`s at once (that's DB-wide unavailability, not per-hand corruption — must not
auto-void every active hand table-wide because the DB briefly hiccuped).

**2 & 3. Authoritative source and representation.** `BalanceTransaction` filtered by `handId`.
Types: `BLIND_SB`, `BLIND_BB`, `BET`, `RAISE`, `CALL`, `ALL_IN` (debits), `REFUND`, `PAYOUT`
(credits). Side pots aren't a separate structure — multiple `PAYOUT` rows differentiated by
`metaJson.potIndex`.

**4. Deterministic refund computation.**
```
refundable(userId) = max(0, -Σ amountCents WHERE handId = stuckHandId AND userId = userId)
```
Correct specifically because a stuck hand has no legitimate `PAYOUT` reflecting won equity yet — if
it did, the hand wasn't actually stuck.

**5. Partial payouts before the fault.** Handled automatically by the same formula — already-issued
credits net out per player. What must not be assumed: that the result is complete or fair. If a
partial payout distributed real winnings before the crash, post-recovery global sum (refunds +
payouts already issued − contributions) may not net to zero. That residual is a corrupted-settlement
signal, not something to silently absorb — compute and surface it explicitly, flagged for human
review, never auto-resolved.

**6. Durable marker / double-run prevention.** A new `HandRecovery` table, `handId` unique. The
`INSERT` is the CAS-acquire (unique-constraint violation = already running/done), mirroring the
`externalRef`-uniqueness idempotency pattern `LedgerService` already uses. Row: `status:
RECOVERING | VOIDED | FAILED`, `triggerReason`, `triggerDiagnostic`, `startedAt`, `completedAt`.
Its `id` seeds every refund's `externalRef` (`recovery_${recoveryId}_${userId}`).

**7. Hand history marking.** Reuse `Hand.reason` (currently free-text `String?`, values
`"LAST_PLAYER" | "SHOWDOWN"` — no migration needed for this part) with a new value,
`"VOIDED_RECOVERY"`, stamped alongside `endedAt` in the final step. That final update must be
conditional (`updateMany({ where: { id: handId, endedAt: null } })`) so recovery can never clobber
a hand that legitimately concluded through the normal path in the interim — abort loudly if the
update count is 0.

**8. Side bets.** No money to reverse (see "the two ledgers" above) — `voidSideBetsForHand` already
exists. Ordering matters: void side bets **before** the final `Hand` CAS that sets `endedAt`,
because `sweepStaleSideBets()` treats any `ACTIVE` side bet whose `hand.endedAt` is set as "go
resolve it normally" — it needs a guard (`hand.reason !== "VOIDED_RECOVERY"`) added so it never
attempts normal win/lose resolution against a hand recovery already voided.

**9. Diagnostics.** Extend the existing `DealerDiagnosticType`/`emitDiagnostic` mechanism
(`apps/server/src/engine/dealer/orchestration/DealerDiagnostics.ts`) rather than a new channel:
`HAND_RECOVERY_TRIGGERED`, `HAND_RECOVERY_COMPLETED`, `HAND_RECOVERY_FAILED`. Each carries
`tableId`, `handId`, `recoveryId`, the triggering diagnostic/error, per-player refund amounts, and
the Q5 residual if nonzero.

**10. Restart mid-recovery.** The refund vector is recomputed from ledger facts every time, not
checkpointed, and every write is idempotent (`HandRecovery` unique insert, `BalanceTransaction`
unique `externalRef`, `PlayerInteraction` conditional `updateMany`). Restart = run the same
procedure again: find the existing `HandRecovery` row in `RECOVERING` (resume, not a fresh CAS),
recompute refunds (already-applied ones net out per Q5), reissue `creditRefund` calls (no-ops
where already applied), void side bets (no-op where already voided), attempt the final conditional
`Hand` CAS. No step-N bookkeeping needed — recompute-and-replay is safe by construction.

## Pipeline shape

```
detect (P2003 on Hand-scoped write, past streak, single handId)
  → acquire lock (INSERT HandRecovery, unique on handId — P2002 = already running/done)
  → CAS hand to RECOVERING (HandRecovery.status, not a Hand-table field)
  → derive refund vector (Σ BalanceTransaction per userId WHERE handId — ledger read only)
  → execute idempotent refunds (LedgerService.creditRefund, externalRef seeded by recoveryId)
  → void ACTIVE side bets for handId (status flip only — PlayerInteractionService.voidSideBetsForHand)
  → conditional CAS Hand{endedAt: null → now, reason: "VOIDED_RECOVERY"} (abort loudly if count=0)
  → HandRecovery.status → VOIDED
  → diagnostics (HAND_RECOVERY_COMPLETED, with residual flag if global sum ≠ 0)
```

## Why this is parked, not built

`HandRecovery` is a new table (migration), plus a state machine, restart semantics, automated
fault classification (distinguishing "this hand's Hand row is really gone" from every other
circuit-breaker trip), a player-action-side failure-streak counter (doesn't exist yet — only the
bot path has one), and a real test suite for economic-terminal-state code. That's real machinery
for a failure path not yet observed outside local dev. Build it if/when this happens in production
often enough to matter — the design above is the ready path when that day comes.

## MVP scope actually shipped

- `apps/server/src/engine/Dealer.ts` — bounded circuit breaker on `BOT_SCHEDULED_ACTION_FAILED`.
- `apps/server/src/engine/dealer/turn/TurnAutomationService.ts` — bounded, timer-backed retry
  (was unbounded `queueMicrotask`) on the "no player at seat" branch of `maybeActForBot()`.
- `apps/server/src/engine/dealer/orchestration/DealerDiagnostics.ts` — two new diagnostic types
  for the above.
- `apps/server/src/engine/economy/PlayerInteractionService.ts` — `voidSideBetsForHand()`, a
  cheap, ledger-free status-flip helper, ready for whenever a manual/admin void-hand action exists
  to call it. Not wired to anything yet.
