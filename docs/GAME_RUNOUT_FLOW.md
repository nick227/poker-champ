# Game Runout Flow

## Purpose
This document defines the canonical runout model so all-in hands (human vs bot and multi-way) reveal board/payouts predictably before redeal.

## Phase Model
The table has three effective phases:
- `BETTING`: `street !== "WAITING"` and `runoutMode === "NONE"`.
- `RUNOUT`: `runoutMode === "STAGED"`.
- `WAITING`: `street === "WAITING"`.

`runoutMode` is on `PokerState`:
- `"NONE"`: normal action flow.
- `"STAGED"`: betting is closed; only lifecycle timers may advance state.

## Hard Guards
- `ActionService.execute(...)`: rejects as `INVALID_ACTION` if `runoutMode === "STAGED"`.
- `TurnAutomationService.maybeActForBot(...)`: returns immediately if `runoutMode === "STAGED"`.
- `ActionOptionsService`: returns no action options during staged runout.

This prevents race conditions from user actions or bot automation while cards are being revealed.

## Canonical Trigger
`HandLifecycleService.advanceStreetOrShowdown()` enters staged runout when either:
- `allRemainingPlayersAllInOrFolded(state)` is true, or
- `noFurtherBettingPossible(state)` is true.

Then it sets `state.runoutMode = "STAGED"` and runs the reveal pipeline.

## Canonical Runout Driver
During `RUNOUT`, only `HandLifecycleService` advances streets:
1. Reveal next street (`PREFLOP -> FLOP`, `FLOP -> TURN`, `TURN -> RIVER`).
2. Emit `RUNOUT_STAGE` snapshot.
3. Wait `RUNOUT_STAGE_DELAY_MS`.
4. Repeat until river.
5. Move to `SHOWDOWN`, compute payouts, emit `HAND_END`.

No betting-round reset/turn assignment occurs during staged runout.

## Showdown, Hold, Redeal
After showdown payout:
1. Emit `HAND_END`.
2. Wait `HAND_RESULT_HOLD_MS` (winner/payout visibility window).
3. Set `nextHandAtTs` and emit countdown snapshot.
4. Start next hand after `NEXT_HAND_DELAY_MS` if enough players remain.

## Timing Source of Truth
All timings are centralized in `src/engine/dealer/timing.ts`:
- `RUNOUT_STAGE_DELAY_MS`
- `HAND_RESULT_HOLD_MS`
- `NEXT_HAND_DELAY_MS`
- `BOT_ACTION_DELAY_MS`

## Snapshot Sequence (All-In Typical)
1. `ACTION_ACCEPTED`/`BOT_ACTION`
2. `RUNOUT_STAGE` (flop)
3. `RUNOUT_STAGE` (turn)
4. `RUNOUT_STAGE` (river)
5. `HAND_END` (payout visible)
6. `AUTO_TRANSITION` (countdown)
7. `HAND_START`

## Deferred transition to WAITING
`state.street = "WAITING"` must happen **after** the `HAND_END` snapshot is emitted, not when building the plan list. Otherwise every snapshot (including `RUNOUT_STAGE` and `HAND_END`) would be built with `hand: undefined` and clients would not see the board or hand result. The lifecycle returns a `TRANSITION_TO_WAITING` plan; the Dealer executes it after emitting `HAND_END`, then runs `RELEASE_PENDING_SEATS` and `SCHEDULE_NEXT_HAND`.

## Client rendering (WAITING phase)
When `snapshot.hand` is undefined (WAITING), the UI must still show the last board and winner so the hand does not appear to "skip" to the next deal. Client hardening:

- **Community board**: `getCommunityCards()` uses `snapshot.hand?.board ?? snapshot.lastHandResult?.board` so the board stays visible during and after transition.
- **Pot**: `getPotCents()` already falls back to `snapshot.lastHandResult?.potCents`.
- **EmptyTableView**: Renders the same board (via the adapter) and receives `handResultMessage`; passes it to `DealerAnnounceBar` and `OpponentStrip` (e.g. `winnerName`) so the winner/result remains visible until the next hand starts.
- **[id].tsx**: Derives `handResultMessage` from `snapshot.lastHandResult` and passes it to both `TableLayout` and `EmptyTableView`.

Regression coverage (server): assert `HAND_END` snapshot has `hand.street === "SHOWDOWN"`, full 5-card board, and `lastHandResult.handId`; folding preflop still emits `HAND_END` with `lastHandResult.winnerId`.
