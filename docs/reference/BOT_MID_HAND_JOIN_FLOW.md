# Bot Mid-Hand Join Flow

## Goal

When a bot is added while humans are already in an active hand, the bot must:

1. Take a seat immediately (visible in snapshots).
2. Not participate in the current hand.
3. Not affect current betting state (`toActSeat`, `needsAction`, `roundCurrentBetCents`).
4. Join naturally on the next hand deal.

## Current Runtime Flow

### 1) API/Room entry

- `Dealer.addBot()` delegates to `PlayerLifecycleService.addBot()`.
- Files:
  - `src/engine/Dealer.ts`
  - `src/engine/dealer/services/PlayerLifecycleService.ts`

### 2) Mid-hand bot creation semantics

In `PlayerLifecycleService.addBot()`:

- If `state.street !== "WAITING"` (hand in progress), bot is created as:
  - `status = "ABANDONED"`
  - `sittingOutUntilNextHand = true`
- Bot is seated (`state.seats[seat] = botId`) and persisted for hand-history identity if enabled.
- Lifecycle plans emitted:
  - `EMIT_SNAPSHOT` (seat appears)
  - `MAYBE_AUTOMATE_TURN`
  - no `START_HAND` while hand is active

Why this is safe:

- `eligibleToAct()` returns true only for `status === "ACTIVE"` (`src/engine/rules/BettingRound.ts`).
- `ABANDONED` bot is excluded from turn and betting logic in:
  - `findNextToActSeat(...)`
  - round-complete/invariant checks
  - no-further-betting checks

So the bot cannot be selected as actor in the current hand.

### 3) Dealer executes plans

`Dealer.executePlayerLifecyclePlans()` handles:

- `EMIT_SNAPSHOT`: clients see bot seat immediately.
- `MAYBE_AUTOMATE_TURN`: runs automation only for the *current* `toActSeat`.

Automation guard (`TurnAutomationService.maybeActForBot()`):

- Returns unless player at `toActSeat` is `eligibleToAct(player) && player.needsAction`.
- Mid-hand joined bot is `ABANDONED`, so it cannot trigger auto-action.

### 4) Next hand start inclusion

At `HandLifecycleService.startHand()`:

- ABANDONED players are restored to ACTIVE only if:
  - connected
  - stack > 0
  - `sittingOutUntilNextHand !== true`
- Active players for the hand are resolved with `resolveActivePlayersForHand(...)`, which prefers:
  - `ACTIVE` and not sitting out.
- After active-player resolution, `sittingOutUntilNextHand` is cleared for all players.

Effect:

- A mid-hand joined bot (still flagged sit-out) is excluded from the current hand.
- On the following `startHand()`, that flag has served its purpose and bot is eligible to be dealt in.

## Why Current Betting Is Unaffected

During the hand where bot is added:

- `toActSeat` is not reassigned by add-bot flow.
- `needsAction` flags for existing ACTIVE players are untouched.
- `roundCurrentBetCents` and pot fields are untouched.
- Invariant checks still run after lifecycle mutations (`maybeAssertStateInvariants(...)`).

This preserves current hand continuity.

## Existing Regression Coverage

- `src/tests/dealer.ledger-bot-assertion.test.ts`
  - `keeps betting invariants when bot joins during an active hand`
  - Asserts bot becomes `ABANDONED` + `sittingOutUntilNextHand=true`
  - Executes follow-up actions and asserts no invariant violation.

## Potential Hardening

1. Add explicit event reason for deferred join
- Emit a dedicated log/snapshot marker like `BOT_JOIN_DEFERRED_TO_NEXT_HAND`.
- Makes support debugging easier than inferring from status flags.

2. Add guard test for `toActSeat` stability
- Assert `toActSeat` before/after mid-hand `addBot` is unchanged.
- Prevents future accidental turn-pointer mutation.

3. Add guard test for betting fields stability
- Assert `potCents`, `roundCurrentBetCents`, `minRaiseCents`, `actionCount` unchanged by `addBot`.

4. Strengthen lifecycle contract docs
- Codify that any mid-hand join (human/bot) must be non-eligible until next hand.
- Keep this as a rule near `eligibleToAct` + lifecycle services.

5. Optional explicit status for deferred join
- Today `ABANDONED` is reused for sit-out/deferred join/disconnect states.
- A dedicated status (or an explicit join-deferred flag) could improve observability and reduce semantic overload.

6. Add property-style test for joins during every street
- Simulate join at PREFLOP/FLOP/TURN/RIVER while action is pending.
- Verify no invariant break and no participation until next hand.

## Summary

The current implementation satisfies the requirement:

- Mid-hand bot add is seat-visible only.
- Current hand and betting are not altered.
- Bot is naturally included on the next hand deal.

The hardening items above mainly improve safety against regressions and operational clarity.
