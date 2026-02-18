# Hand Lifecycle, Invariants, and ActionService

Summary of `HandLifecycleService` logic and flows, state invariants, and `ActionService` behavior.

---

## HandLifecycleService

**Location:** `src/engine/dealer/services/HandLifecycleService.ts`

The service owns hand start, street advances, runouts, and hand end. It does **not** run plans; it returns **HandLifecyclePlan[]** that the Dealer executes in order. **Execution contract:** the Dealer must run plans in sequence and honor every step (e.g. `DELAY` for runout staging); skipping or reordering can break runout animation and state consistency.

### Plan kinds

| Kind | Effect |
|------|--------|
| `EMIT_SNAPSHOT` | Broadcast current table state to all (reason + optional actionId). |
| `DELAY` | Wait `ms` (e.g. runout staging). |
| `MAYBE_AUTOMATE_TURN` | If toAct is a bot, trigger bot action. |
| `TRANSITION_TO_WAITING` | Set `street = "WAITING"`, `runoutMode = "NONE"`, clear processed action IDs. |
| `RELEASE_PENDING_SEATS` | Release seats that were pending release. |
| `SCHEDULE_NEXT_HAND` | Schedule next hand (reason, optional delayMs). |

### Flows

**1. startHand()**

- **Guard:** If `countActiveHumanPlayers === 0` → return empty plans.
- Advance dealer button, assign `handId`, reset hand counters and last hand result.
- Set `street = "PREFLOP"`, clear board, pot, runout; reset betting round.
- Restore ABANDONED → ACTIVE if connected and stacked; set OUT for no stack.
- Build `activePlayers` via **resolveActivePlayersForHand(state)** (TableNavigator: seat order → map without sit-out → any ACTIVE); resolution runs *before* clearing `sittingOutUntilNextHand` so sit-out players are excluded for this hand, then the flag is cleared for the next. If &lt;2 → set `street = "WAITING"`, emit `AUTO_TRANSITION`, return.
- Create deck, deal hole cards to active players, persist hand start.
- Set SB/BB seats (heads-up: SB = dealer, else SB = next after dealer).
- Post blinds via SettlementService, set `roundCurrentBetCents`/`minRaiseCents`, `beginRound()`, set `toActSeat` (first to act after BB).
- In non–heads-up, BB does not get `needsAction` (already matched).
- **Plans:** `EMIT_SNAPSHOT(HAND_START)`, `MAYBE_AUTOMATE_TURN`.

**2. advanceStreetOrShowdown()**

- **Staged runout:** If `runoutMode === "STAGED"` and betting still possible → throw.
- If already STAGED or `allRemainingPlayersAllInOrFolded` or `noFurtherBettingPossible`: set `runoutMode = "STAGED"`, run **runoutToRiverStaged()**, set `street = "SHOWDOWN"`, then **finishHandShowdownWithSidePots()** and return those plans.
- Else: compute **next street** (PREFLOP→FLOP→TURN→RIVER→SHOWDOWN). If next is SHOWDOWN → set street SHOWDOWN and return **finishHandShowdownWithSidePots()**.
- Else: set `street = next`, deal community cards for that street, reset betting round, `beginRound()`, set `toActSeat` (first to act left of dealer).
- **Plans:** `EMIT_SNAPSHOT(AUTO_TRANSITION)`, `MAYBE_AUTOMATE_TURN`.

**3. finishHandByLastStanding()**

- Find single winner: not FOLDED and not OUT. If none → set `street = "WAITING"`, return empty plans.
- Credit full pot to winner, apply disconnected auto-action cap, set `lastHandResult` (reason `LAST_PLAYER`).
- Finalize persisted hand as `ALL_FOLDED`.
- **Plans:** `EMIT_SNAPSHOT(HAND_END)`, `TRANSITION_TO_WAITING`, `RELEASE_PENDING_SEATS`, `SCHEDULE_NEXT_HAND`.
- (EMIT then TRANSITION so clients see final snapshot then table transition; matches showdown path.)

**4. finishHandShowdownWithSidePots()**

- If street ≠ SHOWDOWN → prepend **runoutToRiverStaged()** plans to reach RIVER then SHOWDOWN.
- Players in hand = not OUT; eligible = ACTIVE or ALL_IN.
- If eligible ≤ 1 → delegate to **finishHandByLastStanding()**.
- Build side pots, solve hands (pokersolver), determine winners per pot, split payouts (seat order for chops), credit payouts. Reconcile remainder to one fallback recipient if needed; log with `event: "SHOWDOWN_REMAINDER_RECONCILED"` — production should alert on this. **Future refactor:** When extracting a ShowdownResolver, the remainder reconciliation path and this event are key anchors to test against (most likely to regress).
- Set `lastHandResult` (reason `SHOWDOWN`, payouts, showdown hole cards, winning hand description).
- **Plans:** `EMIT_SNAPSHOT(HAND_END)`, finalize hand `SHOWDOWN`, `TRANSITION_TO_WAITING`, `RELEASE_PENDING_SEATS`, `SCHEDULE_NEXT_HAND`.

**5. runoutToRiverStaged()**

- While street ≠ RIVER: advance to next street, deal community cards, push `EMIT_SNAPSHOT(RUNOUT_STAGE)` and `DELAY(RUNOUT_STAGE_DELAY_MS)`.
- Used when all remaining are all-in or no further betting possible; no player actions during runout.

---

## State invariants

**Location:** `src/engine/invariants/assertState.ts`  
**Entry:** `maybeAssertStateInvariants(state)` (no-op in production).

### assertStateInvariants

- **Numerics:** `potCents`, `roundCurrentBetCents`, `minRaiseCents`, `actionCount` ≥ 0.
- **Per player:** `stackCents`, `roundBetCents`, `committedCents` ≥ 0; `roundBetCents` ≤ `committedCents`.
- **needsAction:** Only ACTIVE players may have `needsAction === true`.
- **Eligible to act:** Count `actionablePlayers` (ACTIVE) and `needsActionPlayers` among them.
- **Seats:** Valid seat index, `state.seats[player.seat] === playerId`; every occupied seat references a valid player.
- **Round bet:** `roundCurrentBetCents` ≤ max roundBetCents; when street ≠ WAITING and round bet &gt; 0, must equal max roundBetCents over ACTIVE and ALL_IN.
- **Pot:** `potCents` ≥ sum of `committedCents`.
- **STAGED:** If `runoutMode === "STAGED"` then no player may have `needsAction === true`.
- **Open betting:** If street ≠ WAITING, there is at least one actionable player, and the round is not complete and further betting is possible, then there must be at least one eligible player with `needsAction === true` (“active hand has no eligible player marked needsAction” otherwise).

**Location:** `src/engine/invariants/assertBettingState.ts`  
**Entry:** `maybeAssertBettingState(state)` (no-op in production).

### assertBettingState

- **WAITING:** Only negative-stack and runout/needsAction checks (no open betting).
- **Otherwise:** No negative stacks; `roundCurrentBetCents` equals max `roundBetCents`; STAGED ⇒ no needsAction; **assertToActOrRoundComplete**: if round not complete and further betting possible, then `toActSeat` must point to an ACTIVE player with `needsAction === true`, and there must be at least one such player.

---

## ActionService

**Location:** `src/engine/dealer/services/ActionService.ts`

Applies a single player action to state and returns **ActionResult** and optional **lastAction**.

### ActionResult

| Kind | Meaning |
|------|--------|
| `HAND_FINISHED` | Only one player left (all others folded); hand ends, pot to last standing. |
| `STREET_COMPLETE` | Betting round done or no further betting; advance street or showdown. |
| `TURN_ADVANCED` | Next player to act (optional actorKind for bot). |
| `WAITING_FOR_PLAYERS` | Not used from execute; from other paths. |
| `NO_OP` | No state change (e.g. forced fold when not applicable). |

### execute() guards (order)

1. Player exists.
2. `street !== "WAITING"`.
3. `runoutMode !== "STAGED"`.
4. Player is eligible to act (ACTIVE).
5. `player.seat === state.toActSeat`.
6. **`countNotFoldedPlayers(state) > 1`** — if ≤ 1, throw `HAND_ALREADY_FINISHED` (hand over; prevents applying CHECK/etc. and violating “no eligible player marked needsAction”).

### execute() action handling

- **FOLD:** Record, set status FOLDED, clear actor needsAction, sync round current bet, build lastAction.
- **CHECK:** Require `callAmount === 0`; record, clear needsAction, build lastAction.
- **CALL:** Debit/record call amount (or 0), clear needsAction, build lastAction.
- **BET:** Require round bet 0; amount ≥ min (or all-in); debit, set round level, `onNewBetLevel(actorId)`.
- **RAISE:** Require round bet &gt; 0, raise &gt; current; debit, update round/minRaise, `onNewBetLevel(actorId)`.
- **ALL_IN:** Debit full stack; if new level ≥ min raise then `onNewBetLevel`, else clear actor needsAction; set status ALL_IN.

After the action, **resolvePostAction(state, actorKind)** is called.

### resolvePostAction() (order)

1. **`countNotFoldedPlayers(state) <= 1`** → `HAND_FINISHED`.
2. **`allRemainingPlayersAllInOrFolded(state)`** → set `runoutMode = "STAGED"`, return `STREET_COMPLETE`.
3. **`bettingRoundComplete(state)` or `noFurtherBettingPossible(state)`** → `STREET_COMPLETE`.
4. **`findNextToActSeat(state, toActSeat) === -1`** → `STREET_COMPLETE`.
5. Else set `toActSeat = nextSeat`, return `TURN_ADVANCED`.

Every returned result is passed through **finish(state, result)**, which runs **maybeAssertStateInvariants(state)** then returns the result.

### executeForcedFold()

Used for disconnect/abandon: fold a specific player without them sending an action. Same FOLD state updates; then same **resolvePostAction** logic (HAND_FINISHED / STREET_COMPLETE / TURN_ADVANCED). If the folded player was toAct, advance `toActSeat` to next; otherwise return TURN_ADVANCED without changing toActSeat. No-op if street is WAITING, runout is STAGED, or player is not ACTIVE.

---

## Dealer integration

- **HAND_FINISHED** → `finishHandByLastStanding()` then `maybeAssertBettingState`.
- **STREET_COMPLETE** → `advanceStreetOrShowdown()` then `maybeAssertBettingState`.
- **TURN_ADVANCED** → emit snapshot (e.g. ACTION_ACCEPTED), `maybeAssertBettingState`, `maybeActForBot()`.

Plans from HandLifecycleService are run by **executeHandLifecyclePlans** in the Dealer (e.g. TRANSITION_TO_WAITING then EMIT_SNAPSHOT for last-standing so clients see street WAITING and do not show an action bar).
