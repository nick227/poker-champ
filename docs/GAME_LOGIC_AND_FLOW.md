# Game Logic and Flow — System Design

This document explains how the poker engine keeps hand sequence, pot amounts, player actions, and position/blinds. It complements [BETTING_FLOW.md](./BETTING_FLOW.md) (join/leave, disconnect, action intake).

**Source of truth:** `src/state/PokerState.ts`, `src/state/PlayerState.ts`, `src/engine/Dealer.ts`, `src/engine/rules/BettingRound.ts`, `src/engine/dealer/utils/TableNavigator.ts`, `src/engine/dealer/services/ActionService.ts`, `src/engine/dealer/services/SettlementService.ts`.

---

## 1. Hand sequence (streets)

Hands progress through a fixed sequence of **streets**. The engine does not skip streets.

| Street     | Meaning                          | Board cards |
|-----------|-----------------------------------|-------------|
| `WAITING` | No hand in progress               | 0           |
| `PREFLOP` | Before any community cards        | 0           |
| `FLOP`    | First three community cards       | 3           |
| `TURN`    | Fourth community card             | 4           |
| `RIVER`   | Fifth community card              | 5           |
| `SHOWDOWN`| All-in / betting done; determine winner(s) | 5   |

- **Transition:** `PREFLOP → FLOP → TURN → RIVER → SHOWDOWN`. After payout, state returns to `WAITING`.
- **Early end:** If only one player remains (everyone else folded), the hand ends without going to SHOWDOWN; that player wins the pot and street is set to `WAITING`.
- **Board:** `PokerState.board` holds community cards. FLOP adds 3 cards; TURN and RIVER add 1 each. Deck is owned by `Dealer` (shuffle/deal), not exposed in snapshot.

---

## 2. Pot and betting amounts

### 2.1 Table-level (PokerState)

| Field                    | Role |
|--------------------------|------|
| `potCents`               | Total chips in the center for this hand. Increased when any player puts chips in (blinds, call, bet, raise, all-in). |
| `roundCurrentBetCents`   | Highest **per-round** bet this street. Everyone must match this (or fold/all-in) for the round to complete. |
| `minRaiseCents`          | Minimum **raise increment**. A raise must add at least this much on top of `roundCurrentBetCents` (or be all-in). |

- **Per street:** At FLOP/TURN/RIVER start, `resetBettingRound()` sets `roundCurrentBetCents = 0` and `minRaiseCents = bigBlindCents`. Each player’s `roundBetCents` is also reset.
- **Pot:** Only grows; never decreases until the hand ends and chips are paid out. All debits (blinds, calls, bets, raises, all-in) add to `potCents` and to the player’s `roundBetCents` and `committedCents`.

### 2.2 Player-level (PlayerState)

| Field            | Role |
|------------------|------|
| `stackCents`     | Chips in front of the player. Decreases when they put money in the pot. |
| `roundBetCents`  | Amount this player has put in **this betting round** (this street). Reset each street. |
| `committedCents` | Total amount this player has put in **for the whole hand**. Used for side pots at showdown. |

- **Call amount:** For the current player, `callAmount = max(0, roundCurrentBetCents - player.roundBetCents)`.
- **Settlement:** On any chip-moving action, `SettlementService` updates `stackCents`, `roundBetCents`, `committedCents`, and `state.potCents` so the pot and stacks stay consistent (§9.10).

---

## 3. Player status and “who can act”

### 3.1 Player status (PlayerState.status)

| Status      | Meaning |
|------------|---------|
| `ACTIVE`   | In the hand; can act when it’s their turn. |
| `FOLDED`   | Folded this hand; no more actions; not eligible for pot. |
| `ALL_IN`   | Put all chips in this hand; no more actions this hand. |
| `OUT`      | No chips (busted) or left. |
| `ABANDONED`| Sitting out (e.g. disconnect auto sit-out). |

- **Eligible to act:** Only `ACTIVE` players (`eligibleToAct()`). FOLDED/ALL_IN/OUT/ABANDONED do not get a turn.
- **Eligible for showdown:** `ACTIVE` or `ALL_IN` (`eligibleForShowdown()`). FOLDED are not in the showdown.

### 3.2 needsAction

- **`needsAction`:** True if this player must still respond to the current bet level this round (call, raise, fold, or check if possible).
- **Beginning of round:** `beginRound(state)` sets `needsAction = true` for every `ACTIVE` player.
- **After a bet/raise:** `onNewBetLevel(state, actorId)` sets `needsAction = true` for all other ACTIVE players (they must respond to the new level).
- **After a player acts:** That player’s `needsAction` is set to `false` (`clearPlayerNeedsAction`). If they only called/checked, others may still have `needsAction = true`.

**Betting round complete:** When every ACTIVE player has `roundBetCents === roundCurrentBetCents` (everyone has matched the current bet). Then the engine advances the street or goes to showdown. Canonical single-line form: §9.6.

---

## 4. Blinds and position (dealer, SB, BB, first to act)

### 4.1 Button and blinds

- **Dealer (button):** `PokerState.dealerSeat`. Moves each hand: at hand start, `dealerSeat = findNextActiveSeat(state, dealerSeat) ?? 0` (next ACTIVE seat with chips, clockwise).
- **Small blind (SB):** In heads-up (2 players), the **dealer** posts SB. With 3+ players, the seat **left of dealer** (next active) posts SB.
- **Big blind (BB):** Seat **left of SB** (next active) posts BB.

Blinds are posted via `SettlementService.postBlind()`: stack and pot are updated, and `roundCurrentBetCents` is set to the big blind amount for the preflop round.

### 4.2 First to act

- **Heads-up (2 players):**  
  - Preflop: **Button (SB)** acts first.  
  - Postflop (FLOP/TURN/RIVER): **BB** acts first.
- **Multiway (3+ players):**  
  - Preflop: First to act is the seat **left of BB** (UTG).  
  - Postflop: First to act is the seat **left of dealer** (first active seat after button).

After setting first to act, `toActSeat` is set and `beginRound(state)` is called. BB’s `needsAction` is set to `false` preflop only in multiway (they already “acted” by posting BB).

---

## 5. Player advancing (whose turn)

- **Current turn:** `PokerState.toActSeat` — the seat number of the player who must act.
- **Advancing:** After an accepted action, the engine either:
  1. **End hand** (one player left → last standing), or  
  2. **Complete the round** (betting round complete (§9.6) or no further betting possible (§9.9) → advance street or go to showdown), or  
  3. **Next player:** `toActSeat = findNextToActSeat(state, toActSeat)`.

**findNextToActSeat(state, fromSeat):**

- Walks seats clockwise from `fromSeat`.
- Returns the first seat where the player is **eligible to act** and **needsAction === true**.
- If none exist, the betting round must be complete and the engine advances street or goes to showdown.
- FOLDED/ALL_IN/OUT/ABANDONED are skipped; only ACTIVE with chips can be to-act.

So: **hand sequence and pot are driven by state (street, potCents, roundBetCents, etc.); who acts next is driven by `toActSeat` and `findNextToActSeat`.**

---

## 6. Player actions (brief)

All actions require: hand running (not `WAITING`), player **eligible to act**, and **player’s seat === toActSeat**. Actions are applied by `ActionService`; chip movement is done only by `SettlementService` (§9.10). Then the engine updates turn/street/hand end.

| Action | Effect |
|--------|--------|
| **FOLD** | Player status → `FOLDED`, `needsAction = false`. No chips moved. If one player left, hand ends (last standing). Else turn advances to next eligible seat. |
| **CHECK** | Allowed only when `callAmount === 0`. `needsAction = false`. Turn advances. |
| **CALL** | Put `callAmount` into the pot (debit stack, add to `roundBetCents` and `committedCents`, add to `potCents`). `needsAction = false`. Turn advances. If `callAmount === 0`, treated as check. |
| **BET** | Allowed only when `roundCurrentBetCents === 0`. Put a positive amount (≥ big blind, unless all-in) into the pot. Updates `roundCurrentBetCents` and `minRaiseCents`; `onNewBetLevel()` so others must respond. Turn advances. |
| **RAISE** | Allowed when there is already a bet. `amountCents` is “raise to” (total this round). Must be at least `roundCurrentBetCents + minRaiseCents` (or all-in). Updates `roundCurrentBetCents` and `minRaiseCents`, `onNewBetLevel()`. Turn advances. |
| **ALL_IN** | Put entire stack in. If the all-in amount reopens action (raise ≥ minRaiseCents), `onNewBetLevel()`; else only that player’s `needsAction = false`. Player status → `ALL_IN`. Turn advances. |

After each accepted action, the engine checks in order:

1. **Only one not-folded player left?** → End hand (last standing), pay pot, set street to `WAITING`.  
2. **Betting round complete (§9.6) or no further betting possible (§9.9)?** → Advance street (or go to showdown).  
3. **Else** → Set `toActSeat = findNextToActSeat(state, toActSeat)` and emit snapshot; bots/disconnected players may auto-act.

---

## 7. End-to-end flow (single hand)

1. **Start hand** (`startHand()`):  
   - Move button: `dealerSeat = findNextActiveSeat(state, dealerSeat) ?? 0`.  
   - Reset: street = PREFLOP, pot = 0, clear board, reset all players’ `roundBetCents`/`committedCents`, set ACTIVE (or OUT if no chips).  
   - Deal hole cards.  
   - Post SB and BB; set `roundCurrentBetCents = bigBlindCents`, `minRaiseCents = bigBlindCents`.  
   - Set `toActSeat` (first to act: preflop = heads-up button else left of BB; postflop = heads-up BB else left of dealer).  
   - `beginRound(state)`.  
   - Emit snapshot; maybe trigger bot/disconnect auto-action.

2. **Action loop:**  
   - Only the player in `toActSeat` can act.  
   - On valid action: apply action (FOLD/CHECK/CALL/BET/RAISE/ALL_IN), update pot/stacks/round bets, then either end hand, advance street, or set `toActSeat = findNextToActSeat(...)`.

3. **Street advance** (`advanceStreetOrShowdown()`):  
   - If no further betting possible (e.g. all all-in), run out board to RIVER then go to SHOWDOWN.  
   - Else: next street = FLOP → TURN → RIVER → SHOWDOWN.  
   - Deal community cards for the new street.  
   - `resetBettingRound(state)`, `beginRound(state)`, `toActSeat = findNextToActSeat(state, dealerSeat)` (first to act postflop: heads-up = BB, multiway = left of dealer).  
   - Emit snapshot; maybe trigger bot auto-action.

4. **Showdown / last standing:**  
   - Last standing: one player not FOLDED/OUT → they win full pot; street = WAITING; schedule next hand.  
   - Showdown: build side pots from `committedCents`, evaluate hands, split pot, credit payouts; street = WAITING; schedule next hand.

5. **Next hand:** When `street === WAITING` and enough seated players, `startHand()` runs again (after a short delay if used).

---

## 8. Summary table

| Concept            | Where it lives / how it’s determined |
|--------------------|--------------------------------------|
| Hand sequence      | `PokerState.street`: WAITING → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → WAITING. |
| Pot amount         | `PokerState.potCents`; increased on every blind/call/bet/raise/all-in. |
| Current bet level  | `PokerState.roundCurrentBetCents`; resets each street; raises update it. |
| Min raise          | `PokerState.minRaiseCents`; set at round start and when a full raise is made. |
| Player’s round bet | `PlayerState.roundBetCents` (resets each street). |
| Player’s total in   | `PlayerState.committedCents` (used for side pots). |
| Who acts next      | `PokerState.toActSeat`; advanced by `findNextToActSeat(state, toActSeat)` after each action. |
| Who must act       | `PlayerState.needsAction`; set by `beginRound` and `onNewBetLevel`; should match derived rule (§9.5). |
| Dealer / SB / BB   | `dealerSeat`; SB = dealer (heads-up) or left of dealer; BB = left of SB. |
| First to act       | Preflop: button (heads-up) or left of BB (multiway). Postflop: BB (heads-up) or left of dealer (multiway). |

This is the core game logic; for join/leave, disconnect, and action intake, see [BETTING_FLOW.md](./BETTING_FLOW.md).

---

## 9. Hard invariants and clamp-down strategy

To reduce drift and make bugs obvious, the following are **non-negotiable**. Add runtime asserts in dev builds.

### 9.1 Pot / stack invariants

- **Chip conservation:** `sum(player.stackCents) + potCents === totalTableChipsAtHandStart` (over all players in the hand at start).
- **Round ≤ committed:** `player.roundBetCents <= player.committedCents` for every player.

### 9.2 Bet level invariant

- **roundCurrentBetCents:** `roundCurrentBetCents === max(player.roundBetCents)` over all ACTIVE and ALL_IN players (the current bet to match).

### 9.3 Turn invariants

When `street !== WAITING`:

- **Exactly one to-act:** Exactly one seat satisfies: `seat === toActSeat` **and** `eligibleToAct(player) && player.needsAction === true`.
- **Or round complete:** If no such seat exists, the betting round must be complete (engine advances street or goes to showdown).

These eliminate most phantom-action bugs.

### 9.4 Betting invariants

- If `roundCurrentBetCents === 0` → BET allowed, RAISE forbidden.
- If `roundCurrentBetCents > 0` → BET forbidden, RAISE allowed.
- `minRaiseCents` never decreases during a street.

### 9.5 needsAction derived rule (single source of truth)

**Canonical definition:** For ACTIVE players, a player “owes action” iff they have not yet matched the current bet:

- For each ACTIVE player: `needsAction` should equal `player.roundBetCents < roundCurrentBetCents`. (ALL_IN/FOLDED/OUT are not eligible to act and do not have needsAction in the same sense.) **Exception:** When a short all-in did not reopen action (§9.8), some ACTIVE players may have `roundBetCents < roundCurrentBetCents` and `needsAction === false` (they already acted at the prior level).

**Recommendation:** Keep `needsAction` as stored state, but add an assertion (e.g. in dev) that it matches this derived rule. This catches desync instantly. Betting round completion can then be expressed as: “for every ACTIVE player, `player.roundBetCents === roundCurrentBetCents`” — and `needsAction` is an optimization, not the rule.

### 9.6 Canonical betting round completion (single line)

- **bettingRoundComplete** = for every ACTIVE player: `player.roundBetCents === roundCurrentBetCents`.

No other mental model. This aligns with live poker.

### 9.7 Canonical turn advance (no other branches)

After any accepted action:

1. If one not-folded player remains → end hand (last standing).
2. Else if betting round complete → advance street (or showdown).
3. Else → `toActSeat = next eligible seat clockwise`.

If the code does something different, it’s a bug.

### 9.8 All-in (rules-accurate, one sentence)

**All-in behaves like CALL unless it increases the bet by ≥ minRaise.**

- If `newRoundBet > roundCurrentBetCents`:  
  - `delta = newRoundBet - roundCurrentBetCents`.  
  - If `delta >= minRaiseCents`: set `roundCurrentBetCents = newRoundBet`, `minRaiseCents = delta`, reopen action.  
  - Else: set `roundCurrentBetCents = newRoundBet`, do **not** reopen action.  
- Else: just a call (no reopen).

Heads-up rules (button = SB, button acts first preflop, BB first postflop) are already correct; no change.

### 9.9 “No further betting possible” — derived, not special-case

Do not special-case a separate “no further betting possible” path. Derive it:

- If every player who is not OUT is either ALL_IN or FOLDED → run out the board (no more actions).

This removes an extra conceptual branch.

### 9.10 One place owns chip movement

**Only SettlementService mutates:** `stackCents`, `roundBetCents`, `committedCents`, `potCents`.

- **ActionService** decides *what* should happen (action legality, amounts).
- **SettlementService** decides *how many* chips move and updates state.

Never mix these. This prevents most accounting bugs.

### 9.11 Bot / internal action guard (prevent generated-action bugs)

Before executing any internal or bot action, enforce:

- `seat === toActSeat` → else abort.
- `eligibleToAct(player)` → else abort.
- `player.needsAction === true` → else abort.

Do not rely on ActionService to reject later; guard at the call site so illegal or stale actions never run.

### 9.12 Minimum safe mental model (keep small)

Only four things to remember:

| Concept | Role |
|--------|------|
| **street** | Controls which cards are on the board. |
| **roundCurrentBetCents** | What must be matched this round. |
| **roundBetCents** | What each player has contributed this street. |
| **toActSeat** | Whose turn it is. |

Everything else is derivable. If a piece of logic does not relate to one of these four, question it.

---

## 10. Canonical rules test suite

Behavioral invariants are enforced by **`src/tests/dealer.canonical-rules.test.ts`**. The suite locks:

- Official poker turn/blind rules (heads-up and multiway).
- Betting legality (BET vs RAISE gating, CHECK only when callAmount === 0).
- Min-raise and short all-in semantics (no reopen when delta &lt; minRaise).
- Pot/side-pot conservation.
- Leave semantics (consented leave mid-hand = forced fold then settle).
- Turn ownership (exactly one to-act when round not complete; no phantom turns).

It also detects **toAct / needsAction drift**, which is a common cause of bad generated actions. See the test file for the full list of cases.

---

## 11. Code alignment (rules vs implementation)

Audit of the codebase against this document:

| Rule / invariant | Code location | Status |
|------------------|---------------|--------|
| **findNextToActSeat** no fallback | `TableNavigator.findNextToActSeat`: returns first seat with eligibleToAct && needsAction; else returns `-1`. Callers treat `-1` as “round complete” and advance street. | ✓ Match |
| **BET ≥ big blind unless all-in** | `ActionService` BET case: `amount < state.bigBlindCents && !isAllIn` → INVALID_ACTION. | ✓ Match |
| **RAISE when roundCurrentBetCents > 0; BET when === 0** | ActionService gates BET/RAISE by `state.roundCurrentBetCents`. | ✓ Match |
| **CHECK only when callAmount === 0** | ActionService CHECK: `callAmount !== 0` → INVALID_ACTION. | ✓ Match |
| **All-in: delta ≥ minRaise reopens; else no reopen** | ActionService ALL_IN: `if (delta >= prevMinRaise) onNewBetLevel(...); else clearPlayerNeedsAction(player)`. | ✓ Match |
| **SettlementService sole mutator of chip fields** | `stackCents`, `roundBetCents`, `committedCents`, `potCents` are only updated in `SettlementService` (postBlind, applyDebitToRuntimeState) and in hand/round resets (HandLifecycleService, resetBettingRound). ActionService uses `applyActionDebit` callback → SettlementService. | ✓ Match |
| **bettingRoundComplete** | `BettingRound.bettingRoundComplete`: no needsAction and every ACTIVE has roundBetCents === roundCurrentBetCents. | ✓ Match |
| **noFurtherBettingPossible** | `BettingRound.noFurtherBettingPossible`: no ACTIVE among contenders (all ALL_IN or folded). | ✓ Match |
| **Turn advance (3 branches)** | `ActionService.resolvePostAction`: one left → HAND_FINISHED; round complete or no further betting → STREET_COMPLETE; else findNextToActSeat, -1 → STREET_COMPLETE. | ✓ Match |
| **Button / first to act** | `HandLifecycleService.startHand`: dealerSeat = findNextActiveSeat(state, dealerSeat) ?? 0; SB/BB per heads-up vs multiway; toActSeat = findNextToActSeat(state, bbSeat) preflop, findNextToActSeat(state, dealerSeat) postflop. | ✓ Match |
| **Bot guard** | `TurnAutomationService.maybeActForBot`: only considers player at `state.toActSeat`; returns if !eligibleToAct(player) \|\| !player.needsAction. | ✓ Match |
| **State invariants (dev)** | `invariants/assertState.ts`: roundBetCents ≤ committedCents; non-ACTIVE with needsAction fail; eligible + below current bet but !needsAction fail; roundCurrentBetCents ≤ maxRoundBet; when street !== WAITING and roundCurrentBetCents > 0, roundCurrentBetCents === max(roundBetCents) over ACTIVE/ALL_IN (§9.2); potCents ≥ sum committedCents; “no to-act when round not complete” fail. | ✓ Match |

---

## Document history

| Date / scope | Changes |
|--------------|---------|
| Initial | Created §§1–8: hand sequence, pot/betting amounts, player status and needsAction, blinds/position, player advancing (findNextToActSeat), player actions, end-to-end flow, summary table. |
| Invariants | Added §9 (hard invariants and clamp-down): pot/stack invariants, bet level invariant, turn invariants, betting invariants (BET/RAISE gating, minRaiseCents), needsAction derived rule (§9.5), canonical betting round completion (§9.6), canonical turn advance (§9.7), all-in rule (§9.8), “no further betting possible” derived (§9.9), SettlementService as sole owner of chip fields (§9.10), bot/internal action guard (§9.11), minimum mental model (§9.12). |
| Test suite | Added §10: reference to `src/tests/dealer.canonical-rules.test.ts` and what the suite locks. |
| findNextToActSeat | Replaced “fallback” wording with: if no seat has eligibleToAct and needsAction, the betting round must be complete and the engine advances street or goes to showdown. |
| BET rule | Action table: BET minimum stated as “≥ big blind, unless all-in” (replacing “≥ min open, typically big blind”). |
| Cross-references | Added §9.6 / §9.9 / §9.10 references in §§2, 3, 5, 6, 8. Clarified that only SettlementService mutates chip state; ActionService applies actions. |
| Betting round complete | §3.2: single condition (every ACTIVE has roundBetCents === roundCurrentBetCents) and pointer to §9.6. |
| First to act | §7 and §8: postflop first to act = BB (heads-up) or left of dealer (multiway). |
| needsAction (§9.5) | Defined for ACTIVE players only; note that ALL_IN/FOLDED/OUT are not “owe action” in the same sense. |
| §7 start hand | Button move: `findNextActiveSeat(state, dealerSeat) ?? 0` (added state argument and null coalesce). |
| §9.9 | “No further betting possible” rephrased to: every player who is not OUT is either ALL_IN or FOLDED. |
| §9.8 | All-in formulas use `roundCurrentBetCents` (replaced shorthand roundCurrentBet). |
| §4.1 | Dealer button: `findNextActiveSeat(state, dealerSeat) ?? 0` for consistency with §7. |
| Code alignment | Added §11: audit table of rules vs implementation. All items match. |
| Assert §9.2 | `assertState.ts`: added roundCurrentBetCents === max(roundBetCents) over ACTIVE/ALL_IN when street !== WAITING and roundCurrentBetCents > 0. |
| Assert §9.5 exception | Relaxed assert: removed “eligible below current bet ⇒ needsAction” (conflicts with short all-in not reopening). Doc §9.5: added exception for short all-in case. |
