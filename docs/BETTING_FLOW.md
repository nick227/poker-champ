# Betting Flow (Join, Leave, Disconnect, Action Handling)

This document describes the end-to-end server flow for a cash table in `PokerRoom` + `Dealer`, with focus on:
- players joining and rejoining
- players leaving or disconnecting
- betting actions (`CHECK`, `CALL`, `BET`, `RAISE`, `ALL_IN`, `FOLD`)
- automatic behavior when players are disconnected

## Scope and Source of Truth
- Room orchestration: `src/rooms/PokerRoom.ts`
- Hand + betting engine: `src/engine/Dealer.ts`
- Persistent seat sessions: `src/engine/seats/TableSeatSessionService.ts`

## High-Level Lifecycle
1. Client joins room with auth token and join options.
2. `PokerRoom` validates auth and join payload, then binds session to a user.
3. `Dealer` seats/restores player and emits `TABLE_SNAPSHOT`.
4. When enough players are eligible, `Dealer.startHand()` begins a hand.
5. Actions are accepted through a serialized queue (`handleAction`) to avoid race conditions.
6. After each accepted action, engine either:
- advances turn,
- advances street/showdown, or
- ends hand immediately (last player standing).
7. On leave/disconnect, room applies either immediate removal (consented leave) or reconnect grace handling.

## Join and Rejoin Flow

### A) New Join
1. `PokerRoom.onJoin` logs `POKER_JOIN_ATTEMPT`.
2. Join payload is validated (`TableJoinOptionsSchema`), including `buyInCents`.
3. Room binds `client.sessionId -> userId` and calls `Dealer.addPlayer(...)`.
4. `Dealer.addPlayer`:
- finds open seat
- validates buy-in limits
- processes bankroll -> table buy-in (`CashierService.processCashGameBuyIn`)
- creates `PlayerState` (`ACTIVE`, `connected=true`)
- emits `SEAT_CHANGE` snapshot
- logs `player joined`
5. Room sends `WELCOME`, emits user snapshot (`reason=JOIN`), logs `POKER_JOIN_SUCCESS`.
6. If table now has enough non-OUT players and street is `WAITING`, a hand starts.

### B) In-Memory Rebind (User Already Seated)
If `Dealer.hasPlayer(userId)` is true during join:
1. Room rebinds client to existing seat.
2. `Dealer.markReconnected(userId)` sets `connected=true`, clears deadline, can restore `ABANDONED -> ACTIVE` if stack > 0.
3. Room sends `SESSION_RESTORED` and emits snapshot (`reason=RECONNECT`).

### C) Persistent Rejoin (After Restart/Drop)
If persistent seats are enabled and in-memory seat is missing:
1. Room checks `TableSeatSessionService.findRejoinableSession(...)`.
2. On success, room calls `Dealer.restorePlayerFromSession(...)` and then rebinds client.
3. Player is restored to prior seat/stack and snapshot is emitted as reconnect.

## Leave vs Disconnect

### A) Consented Leave (`CloseCode.CONSENTED`)
1. `PokerRoom.onLeave` unbinds client.
2. Persistent seat marked `LEFT` (if enabled).
3. `Dealer.removePlayer(userId)`:
- cashes out remaining table stack to bankroll
- removes player from seat/state
- emits `SEAT_CHANGE`
- may advance/finish current hand if this removal changes eligibility

### B) Non-Consented Disconnect
1. `PokerRoom.onLeave` marks player disconnected with deadline `now + 60s`.
2. Dealer sets `connected=false`, stores `disconnectDeadlineTs`, emits `SEAT_CHANGE`.
3. Room opens Colyseus reconnection window (`allowReconnection(client, 60)`).

If reconnect succeeds within 60s:
- session is rebound
- `Dealer.markReconnected` runs
- `SESSION_RESTORED` + reconnect snapshot emitted

If reconnect window expires:
- with persistent seats enabled: seat is preserved as sitting out (no immediate remove)
- without persistent seats:
- player marked `ABANDONED` (in-memory sit-out)
- seat released at safe point after hand

## Hand Start and Turn Setup
When `Dealer.startHand()` runs:
1. Dealer button moves to next active seat.
2. Hand state resets: new `handId`, `street=PREFLOP`, pot/action counters reset.
3. Active players receive hole cards.
4. Small blind and big blind are posted (with persisted debits).
5. `roundCurrentBetCents` and `minRaiseCents` set to big blind.
6. If heads-up:
- button (SB) acts first preflop.
- BB acts first postflop.
Else:
- preflop first to act = seat after BB.
- postflop first to act = seat after dealer.
7. Round bookkeeping initialized (`beginRound`), `HAND_START` snapshot emitted.

## Action Intake and Validation
All player actions go through:
1. `PokerRoom` receives `ACTION` message and validates schema.
2. Logs `POKER_ACTION_ATTEMPT`.
3. Calls `Dealer.handleAction(userId, payload)`.
4. Dealer serializes action execution using a queue (`this.actionQueue`).

Common preconditions in `_handleAction`:
- player exists
- hand is running (not `WAITING`)
- player is eligible to act
- it is player's turn (`toActSeat`)

If any check fails, a typed `PokerError` is returned and room logs `POKER_ACTION_REJECTED`.

## Betting Semantics by Action

### `CHECK`
- Allowed only when `callAmount == 0`.
- Otherwise rejected (`INVALID_ACTION`).

### `CALL`
- `callAmount = max(0, roundCurrentBet - player.roundBet)`.
- If `callAmount > 0`, chips are debited and added to pot.
- If `callAmount == 0`, call is accepted as zero-chip action (effectively check-like).

### `BET`
- Allowed only when current bet level is zero.
- Must be positive and satisfy minimum open size (big blind, capped by stack).
- Sets new bet level and min-raise basis.

### `RAISE`
- Allowed only when current bet level is already > 0.
- `amountCents` is treated as raise-to target.
- Must exceed current bet and satisfy min-raise rules unless all-in constrained.

### `ALL_IN`
- Debits full remaining stack.
- If ALL_IN raise delta >= minRaiseCents:
- updates roundCurrentBetCents
- updates minRaiseCents
- reopens action

- If ALL_IN raise delta < minRaiseCents:
- may update roundCurrentBetCents
- does NOT change minRaiseCents
- does NOT reopen action
- Player status becomes `ALL_IN`.

### `FOLD`
- Marks player `FOLDED` and clears action requirement.

## After Every Accepted Action
Dealer evaluates in this order:
1. If only one not-folded player remains -> hand ends by last standing.
2. Else if betting round complete OR no further betting possible -> advance street or go showdown.
3. Else -> move `toActSeat` to next eligible seat and emit action snapshot.

Snapshot reason is:
- `ACTION_ACCEPTED` for humans
- `BOT_ACTION` for bots

## Auto-Action for Bots and Disconnected Humans
`Dealer.maybeActForBot()` runs after key transitions.

- Bot to act: bot brain chooses action, executed with delay.
- Disconnected human to act: auto-action queued immediately:
- auto-`CHECK` if legal
- otherwise auto-`FOLD`

A safety check skips queued auto-actions if the human reconnects before execution.

## Auto Sit-Out Cap (Disconnected Humans)
At hand end, dealer tracks whether a disconnected human was auto-acted.
- Counter increments per hand.
- If counter reaches configured cap, player is marked `ABANDONED` (in-memory sit-out).
- Persisted seat session is also marked sitting out via callback.

## Snapshot and Client Sync Model
The engine is snapshot-first:
- After every relevant event (`JOIN`, `RECONNECT`, `SEAT_CHANGE`, `HAND_START`, `ACTION_ACCEPTED`, `AUTO_TRANSITION`, `HAND_END`), dealer emits `TABLE_SNAPSHOT`.
- `TABLE_SNAPSHOT` is authoritative full-state replacement, not a delta stream.
- Clients must render from latest snapshot state and must not infer logic from snapshot count.
- Snapshot includes:
- table state
- hand state
- per-seat state (including `connected`, `isToAct`)
- hero action options (`callAmount`, legal action flags, raise bounds)
- calculation fields (`hero.calculations`, `calculationsMeta`) from hand calculations coordinator

## Operational Notes
- Join calls are lock-serialized per user/table key to reduce double-join races.
- Actions are globally serialized per table via `actionQueue`.
- Cashier failures on cash-out are logged but do not block seat removal.
- Persistent seat cleanup runs on join to reap expired sitting-out sessions and optionally cash out stale stacks.

## Testing Philosophy
- Assert final authoritative snapshot state, not intermediate transition flags.
- `TABLE_SNAPSHOT` is full-state replacement, so tests should validate resulting hand/seat/action state convergence.
- Avoid assuming exact count/order of intermediate snapshots (for example, `ACTION_ACCEPTED` vs `AUTO_TRANSITION` timing).

## Suggested Logging Additions (Optional)
To improve debuggability of hand flow:
1. Log `HAND_ENDED` with reason (`LAST_PLAYER` vs `SHOWDOWN`) and payout summary.
2. Log street transitions with previous/next street and board card count.
3. Log disconnect state changes with `deadlineTs`, reconnect success/fail, and final disposition (`RESTORED`, `ABANDONED`, `LEFT`).
4. Log rejected action code distribution (`NOT_YOUR_TURN`, `NOT_ELIGIBLE`, `INVALID_ACTION`) for UX tuning.

## Spec Gaps to Ratify
Use this section to convert implementation behavior into explicit product rules. For each item, keep `Current Behavior` aligned to code and set `Desired Rule` as the formal spec decision.

### 1) Side Pots and All-In Resolution
Current Behavior:
- Side pots are derived at showdown from `committedCents` using `buildSidePots(...)`.
- Side pots are not persisted on hand state as a first-class field.

Desired Rule:
- Side pots are derived deterministically at showdown from `committedCents`.
- No `sidePots` array is stored on hand state.
- Payout resolution must be reproducible from HandAction + `committedCents`.

### 2) All-In Below Min-Raise Reopen Semantics
Current Behavior:
- `ALL_IN` updates `roundCurrentBetCents` when it exceeds the current level.
- Reopen occurs only if all-in raise delta is greater than or equal to current `minRaiseCents`.
- Short all-in raise deltas do not reopen action and do not change `minRaiseCents`.

Desired Rule:
- If `ALL_IN` raise delta is below `minRaiseCents`, treat it as call-like for reopening semantics.
- Do not reopen action for players who already acted at prior level.
- Keep `minRaiseCents` unchanged.
- Reopen only when all-in raise delta is greater than or equal to `minRaiseCents`.

### 3) Betting Round Completion Definition
Current Behavior:
- Round completes when all `needsAction` are false and every `ACTIVE` player has matched `roundCurrentBetCents`.
- Separate fast path ends betting when no `ACTIVE` contenders remain (`noFurtherBettingPossible`).

Desired Rule:
- Round completes when:
- all ACTIVE players have `needsAction === false`
- and `roundBetCents === roundCurrentBetCents`
- Or when `noFurtherBettingPossible()` (only folded/all-in/abandoned remain)

### 4) First To Act After Street Transition
Current Behavior:
- On FLOP/TURN/RIVER, `toActSeat` is set from `findNextToActSeat(dealerSeat)` after `beginRound()`.

Desired Rule:
- Heads-up:
- postflop first to act = BB.
- Multiway:
- first to act = seat left of dealer.

### 5) Reconnect During Queued Auto-Action
Current Behavior:
- Queued auto-action for disconnected humans is skipped if player reconnects before execution.
- Turn remains available for the reconnected player when still eligible.

Desired Rule:
- If player reconnects before queued auto-action executes:
- auto-action is canceled
- turn remains on that player

### 6) Consented Leave While In-Hand
Current Behavior:
- Consented leave path forces fold semantics when player is active in-hand.
- Engine resolves hand effects from that fold, then removes seat, then attempts cashout.

Desired Rule:
- If seated player leaves during an active hand, force immediate fold resolution first.
- Order: `FOLD -> resolve hand logic -> remove seat -> cash out`.
- Goal: prevent mid-hand leave from bypassing fold semantics.

### 7) Status Eligibility for Next Hand
Current Behavior:
- Players dealt into hand must be `ACTIVE` with chips at hand start.
- `FOLDED` and `ALL_IN` from prior hand are normalized back to `ACTIVE` if chips remain.
- `ABANDONED` and `OUT` are not auto-dealt.

Desired Rule:
- Players dealt into next hand must be:
- status `ACTIVE`
- `stack > 0`
- `FOLDED` and `ALL_IN` normalize back to `ACTIVE`.
- `ABANDONED` and `OUT` are not auto-dealt.

### 8) Heads-Up Blind/Button Rule
Current Behavior:
- Heads-up special-case is implemented:
- dealer/button posts SB,
- other player posts BB,
- preflop first to act is button,
- postflop first to act is BB.

Desired Rule:
- In heads-up only:
- Dealer button posts SB.
- BB posts big blind.
- Preflop: button (SB) acts first.
- Postflop: BB acts first and button acts last.

### 9) Hand Abort Policy
Current Behavior:
- No explicit `HAND_ABORTED` snapshot reason/path in the documented flow.
- Primary terminal paths are `HAND_END` via `LAST_PLAYER` or `SHOWDOWN`.

Desired Rule:
- No `HAND_ABORTED` path for MVP.
- Fatal errors should log and force table into errored state.
- Normal terminal states are `LAST_PLAYER` or `SHOWDOWN`.

### 10) Snapshot Ordering and Cardinality Contract
Current Behavior:
- Actions execute serially through one table-scoped queue.
- Snapshot emission is event-driven; count per action can vary by transition path.

Desired Rule:
- `TABLE_SNAPSHOT` is authoritative full-state replacement.
- Clients must not infer behavior from snapshot count; they must render latest full snapshot state.

### 11) Action Idempotency
Current Behavior:
- ACTION payload accepts optional `actionId`.
- Dealer keeps per-hand processed action IDs and silently ignores duplicates within same hand.

Desired Rule:
- Support optional action id (`actionId`) on inbound ACTION messages.
- Maintain a per-hand processed set of action IDs.
- If duplicate ID is seen again in the same hand, ignore silently and do not re-run logic.
- Clear processed IDs at hand end (and when a new hand starts).

### 12) Buy-In Enforcement on Rejoin/Restore
Current Behavior:
- Min/max buy-in validated on new joins.
- Restore-from-session path restores persisted stack/seat without revalidating against buy-in bounds.

Desired Rule:
- Allow restore below table minimum buy-in.
- Min/max buy-in constraints apply to new joins, not seat restores.

### 13) Deck Ownership and Reproducibility
Current Behavior:
- Deck lifecycle (shuffle/deal) is owned by `Dealer`, not stored as a full deck object on public hand state.

Desired Rule:
- Dealer exclusively owns deck lifecycle.
- Deck order is not exposed or persisted in snapshot.
- Reproducibility relies on HandAction + payouts, not full deck replay.

### 14) Multi-Table Isolation
Current Behavior:
- Action serialization queue is scoped to each `Dealer` instance (per room/table instance).

Desired Rule:
- Each table has its own `Dealer` instance and `actionQueue`.
- No cross-table shared state for gameplay execution.
