# Tournament Policy — Implementation Reference

**Version:** v1  
**Updated:** 2026-05-22  
**Authority:** This document is the source of truth for tournament economy, lifecycle, and player-state decisions. The architecture doc (`TOURNAMENT_SYSTEM_DESIGN.md`) describes the *how*; this doc is the *what* and *why*.

---

## 1. Final Policy

### 1.1 Start semantics

| Rule | Detail |
|------|--------|
| Scheduled `startTime` | NOT official start. Enables join CTA and table provisioning only. |
| Table creation / `RUNNING` status | NOT official start. Room can exist with zero hands dealt. |
| **Official start** | **First valid deal** — the moment the dealer produces hole cards for the first hand. |
| Bot challenge mode | 1 human + N bots is legal. Treated as challenge/achievement mode. Economy rules still apply. |

### 1.2 Bot rules

- Bots do not buy in; no `User.bankrollCents` is touched on bot registration.
- Bots do not increment `prizePoolCents`.
- Bots are excluded from payout slot-count calculations.
- Bots never receive a `TOURNAMENT_PAYOUT` transaction.
- Bots with chips do not block the human-wins check. If exactly one human has chips, tournament is finished regardless of bot chip counts.

### 1.3 Prize pool integrity

- `prizePoolCents` = sum of all human entry fees (+ rebuys when enabled).
- Only `processTournamentRegister` increments the pool; bot registration never does.
- `FINISHED` → 100% of `prizePoolCents` paid out to payable humans. Pool must reach exactly 0 after payouts (remainder cents go to 1st place).
- `ABANDONED` / `CANCELLED` → 100% of `prizePoolCents` refunded to human entrants; pool → 0.

### 1.4 Unregister / refund window

Unregister is allowed only while `status === REGISTERING` **and** `now < startTime`. All other statuses block refunds unconditionally.

| Status | Unregister allowed? |
|--------|-------------------|
| `REGISTERING` (and `now < startTime`) | Yes |
| `LATE_REG` | No |
| `STARTING` | No |
| `RUNNING` | No |
| `FINISHED` / `CANCELLED` / `ABANDONED` | No |

Late registration extends the window for **new paid entries** only. It does not extend the refund window. A late registrant who joins and is charged an entry fee cannot unregister for a refund.

Implemented in `CashierService.processTournamentRefund` via `canUnregisterFromTournament` (`tournament-schedule.ts`), which enforces `status === "REGISTERING"` inside a DB transaction.

### 1.5 Ghost stacks (registered humans who have not sat)

Registered humans who have not occupied a table seat when official start occurs become ghost stacks:
- Post blinds and antes on schedule.
- Auto-fold every street.
- Can bust (stack reaches 0 → `TOURNAMENT_BUST`, no bankroll credit).
- Are payout-eligible if their ghost stack survives to a paid finish position.
- Can convert to active players if they join the table while ghost stack still has chips.

### 1.6 Disconnected seated players

Humans who joined the table then lost connection:
- Seat remains visible and occupied.
- Post blinds and antes on schedule (existing dealer sit-out path).
- Auto-fold every street.
- Can bust while disconnected.
- Reconnection resumes play with current chip count.

### 1.7 Terminal outcomes

| Trigger | Outcome | Refund | Payout |
|---------|---------|--------|--------|
| Exactly 1 human has chips | `FINISHED` | None | 100% prize pool → payable humans |
| All humans busted + max blind level advanced | `ABANDONED` | Full entry per human | None |
| < 2 entrants at start or late-reg close | `CANCELLED` | Full entry per human | None |
| Admin cancel (any pre-terminal status) | `CANCELLED` | Full entry per human | None |
| Orphan room dead 12h+ | `FINISHED` | None | Payouts if humans have ranked finishes |

### 1.8 Payout normalization

When the number of payable humans with ranked finish positions is fewer than the number of configured payout slots, redistribute 100% of the pool proportionally across the filled slots only:

```
normalizedPct[i] = rawPct[i] / sum(rawPct[1..K]) × 100
where K = number of payout slots that have a payable human assigned
```

---

## 2. Lifecycle Table

| Status | Entry condition | Dealing? | Unregister? | Prize pool state |
|--------|----------------|----------|-------------|-----------------|
| `REGISTERING` | Tournament created | No | Yes | Accumulating |
| `LATE_REG` | `startTime` passed, `lateRegMinutes > 0` | No (room may exist) | Yes (if not yet seated + dealt) | Accumulating |
| `STARTING` | `startTime` passed, no late-reg path | No | No | Locked |
| `RUNNING` | 2+ seated; `promoteTournamentToRunningOnJoin` | Yes (when 2+ seated) | No | Locked; busts forfeited |
| `FINISHED` | One human has chips; or orphan | No | No | Distributed to payable humans |
| `ABANDONED` | All humans busted + max blind advanced | No | No | Refunded; pool = 0 |
| `CANCELLED` | < 2 entrants or admin cancel | No | N/A | Refunded; pool = 0 |

**Key distinctions:**

| Event | Status change? | Official start? |
|-------|---------------|----------------|
| `startTime` clock hits | Yes (→ LATE_REG / STARTING) | No |
| Table room created | No | No |
| Status → RUNNING | Yes | No |
| First valid deal | No | **Yes** |

**Status transitions:**

```
REGISTERING  → LATE_REG    startTime due, lateRegMinutes > 0
REGISTERING  → STARTING    startTime due, lateRegMinutes = 0
LATE_REG     → RUNNING     join + ensure-table OR 2+ seated at director tick
STARTING     → RUNNING     join + ensure-table OR 2+ seated at director tick
RUNNING      → FINISHED    one human has chips (post-hand reconciler)
RUNNING      → ABANDONED   all humans busted + blind at max level
ANY          → CANCELLED   admin; or < 2 entrants at start/late-reg-close
RUNNING      → FINISHED    orphan reconcile (room dead ≥ 12h)
```

---

## 3. Money Movement Table

| Event | Actor | `bankrollCents` delta | `prizePoolCents` delta | Tx type |
|-------|-------|----------------------|----------------------|---------|
| Register (human) | Registrant | −`entryFeeCents` | +`entryFeeCents` | `TOURNAMENT_ENTRY` |
| Register (bot) | — | 0 | 0 | none |
| Unregister (human) | Registrant | +`entryFeeCents` | −`entryFeeCents` | `TOURNAMENT_UNREGISTER` |
| Bust: ghost or active human | Registrant | 0 | 0 | `TOURNAMENT_BUST` (forfeit; no credit) |
| Bust: bot | — | 0 | 0 | none |
| CANCELLED refund | Each human registrant | +`entryFeeCents` | −`entryFeeCents` → 0 total | `TOURNAMENT_CANCEL_REFUND` |
| ABANDONED refund | Each human registrant | +`entryFeeCents` | −`entryFeeCents` → 0 total | `TOURNAMENT_ABANDON_REFUND` |
| FINISHED payout, 1st slot | Human in 1st finish pos | +`payoutCents` | −`payoutCents` | `TOURNAMENT_PAYOUT` |
| FINISHED payout, 2nd slot | Human in 2nd finish pos | +`payoutCents` | −`payoutCents` | `TOURNAMENT_PAYOUT` |
| FINISHED payout, Nth slot | Human in Nth finish pos | +`payoutCents` | −`payoutCents` | `TOURNAMENT_PAYOUT` |

**Invariants:**
- After all `TOURNAMENT_PAYOUT` transactions: `prizePoolCents == 0`.
- No `TOURNAMENT_PAYOUT` is ever issued to a bot registration.
- `TOURNAMENT_BUST` never credits bankroll. Table wallet zeroed; chips removed from room.
- All payout transactions carry idempotent `externalRef` (`tournament_payout_{id}_{ordinal}_{userId}`).

---

## 4. Ghost Stack Rules

### 4.1 Definitions

| Type | Condition |
|------|-----------|
| **Never-sat ghost** | Registered human with no table seat at the moment of official start (first deal) |
| **Disconnected player** | Human who joined the table then lost connection |

### 4.2 Behavior matrix

| Behavior | Never-sat ghost | Disconnected player |
|----------|----------------|---------------------|
| Seat visible at table | No (implementation choice; hidden or empty indicator) | Yes |
| Blind/ante posting | Yes, per blind schedule | Yes, per existing dealer sit-out path |
| Pre-flop action | Auto-fold (server-dispatched) | Auto-fold (dealer timer path) |
| Post-flop action | Auto-fold | Auto-fold |
| Can bust | Yes (stack drains to 0 via blinds/antes) | Yes |
| Payout eligible | Yes, if stack survives to a paid finish position | Yes |
| Can resume play | Yes, by joining the table (ghost seat → active seat) | Yes, by reconnecting |

### 4.3 Ghost seat lifecycle

```
Official start (first deal)
  for each TournamentRegistration where isBot=false and not seated:
    create ghost seat with startingStack chips
    mark registration isGhost = true

Each hand (pre-action):
  for each ghost seat with action required:
    dispatch FOLD server-side (director RPC or dealer hook)
    ghost ante/blind posted per standard blind schedule

Ghost stack = 0:
  forfeitTournamentTableBalance (TOURNAMENT_BUST tx)
  assign finishPlace (reverse bust order, same as active players)
  remove ghost seat from room

Human arrives (POST /ensure-table or Colyseus join):
  if registration isGhost = true and finishPlace = null:
    convert ghost seat → active player seat
    set isGhost = false
    human resumes with current chip count
```

### 4.4 Ghost stacks and official start

Ghost stacks do **not** count toward the `MIN_TOURNAMENT_SEATED_TO_DEAL = 2` threshold. That threshold requires real seated connections (human or bot Colyseus clients). Ghost seats are server-side synthetic state only.

### 4.5 Required schema / flag

`TournamentRegistration.isGhost: boolean` (default `false`). Set to `true` when ghost seat is created. Reset to `false` on human arrival. Checked by reconciler for auto-fold dispatch and by payout logic for eligibility.

---

## 5. Payout Rebalance Examples

### 5.1 Base payout structure (by human entrant count)

| Human entrants | Slot 1 | Slot 2 | Slot 3 |
|----------------|--------|--------|--------|
| ≤ 2 | 100% | — | — |
| 3 | 70% | 30% | — |
| ≥ 4 | 50% | 30% | 20% |

Remainder cents (from integer division) go to 1st place slot.

### 5.2 Normalization formula

When `K` filled slots < configured slot count, normalize:

```
normalizedPct[i] = rawPct[i] / sum(rawPct for filled slots only) × 100
```

### 5.3 Examples

---

**Example A — No normalization needed (baseline)**

4 humans register. All play. Pool = $40.

Structure: 3 slots → 50% / 30% / 20%

| Finish | Human | Payout |
|--------|-------|--------|
| 1st | Alice | $20.00 |
| 2nd | Bob | $12.00 |
| 3rd | Carol | $8.00 |
| 4th | Dave | $0 |

Total = $40. No normalization.

---

**Example B — 2 humans refund before start; 2 play**

4 humans register → 3-slot structure determined.  
2 refund during registration → pool = $20 (2 humans remain).  
At payout: 2 humans, but 3 slots in structure. Only 2 slots can be filled.

Raw (for 3 slots): 50% / 30% / 20%  
Filled slots: 1 and 2 only (20% slot has no human)  
Sum of filled raw pcts: 50 + 30 = 80

Normalized:
- Slot 1: 50 / 80 × $20 = **$12.50**
- Slot 2: 30 / 80 × $20 = **$7.50**
- Slot 3: no human → $0

Total = $20. ✓

---

**Example C — Bot challenge mode (1 human + bots)**

1 human registers. Pool = $10.

Structure: ≤2 → 100% to 1st slot.

Human wins. Payout = **$10.00**. No normalization (only 1 slot; 1 human fills it).

---

**Example D — Ghost stacks bust, 1 human survives to 3rd place (paid)**

4 humans register. Pool = $40. Structure: 3 slots.

- Alice, Bob, Carol: never-sat ghosts. Auto-fold to death via blinds.
- Dave: sits and plays.

Bots help pad the table. Dave ends up as last human with chips.

Finish order (among humans):
- Dave: 1st human standing → finishPlace 1
- Carol (ghost): busted 3rd out of 4 humans → finishPlace 2 (2nd-best among humans)
- Bob (ghost): busted 2nd → finishPlace 3
- Alice (ghost): busted 1st → finishPlace 4

All 3 paid slots are filled by humans (Dave at 1st, Carol at 2nd, Bob at 3rd).  
No normalization needed.

| Finish slot | Human | Ghost? | Payout |
|-------------|-------|--------|--------|
| 1st | Dave | No | $20.00 |
| 2nd | Carol | Yes | $12.00 |
| 3rd | Bob | Yes | $8.00 |
| 4th | Alice | Yes | $0 |

Ghosts receive their payouts to `bankrollCents`. They paid in; they finish in the money.

---

**Example E — Only 1 of 4 humans survives; 2 paid slots have ghosts that busted early**

4 humans register. Pool = $40. Structure: 3 slots (50/30/20).

3 humans are ghosts that bust immediately (4th, 3rd, 2nd among humans).
Dave (active) wins.

This is the same as Example D. All 3 paid slots are filled (Dave 1st, ghost 2nd, ghost 3rd). No normalization. Same payouts.

---

**Example F — Normalization: structure has 3 slots, only 2 humans total entered (edge case)**

A 3-slot structure was stored for a tournament where 4 humans registered, but 2 never paid / were rolled back due to a payment error, and `prizePoolCents` reflects only 2 human entries ($20).

At payout time: 2 payable humans, 3 slots. Apply normalization (same as Example B):
- 1st: $12.50, 2nd: $7.50. Total $20. ✓

---

## 6. Edge-Case Test Matrix

| # | Scenario | Expected status | Expected money outcome | Ghost/DC rule exercised |
|---|----------|----------------|----------------------|------------------------|
| 1 | 1 human + 5 bots; human wins | `FINISHED` | Human gets 100% pool | Bot challenge mode |
| 2 | 1 human + 5 bots; human busts (all humans out) | `RUNNING` until max blind → `ABANDONED` | Full refund to human | Max blind abandon path |
| 3 | 4 humans register, 0 sit; bots fill to 6. Ghosts drain to 0. All humans busted. | `ABANDONED` at max blind | Full refund to all 4 humans | Ghost stacks auto-fold and bust |
| 4 | 4 humans register; 3 sit, 1 is ghost. Ghost is last human with chips at end. | `FINISHED` | Ghost wins 1st place payout | Ghost payout eligible |
| 5 | Human joins mid-tournament, ghost seat has chips → converts to active | `RUNNING` (unchanged) | No money movement on conversion | Ghost-to-active conversion |
| 6 | Human disconnects; stack busts while disconnected | `RUNNING`; bust recorded | `TOURNAMENT_BUST`, no bankroll credit | Disconnected bust |
| 7 | Human disconnects; reconnects before bust; wins | `FINISHED` | Payout to winner | DC rejoins path |
| 8 | 4 humans register, 2 refund before `startTime` | `REGISTERING` remains; pool −$20 | Refunds processed | Unregister window |
| 9 | Attempt to unregister after official start (first deal) | 4xx error | No refund | Unregister lock |
| 10 | 4 humans; 2 slots filled at payout (2 refunded post-structure set) | `FINISHED` with normalized payout | 62.5% / 37.5% split | Payout normalization |
| 11 | Admin cancel during `RUNNING` | `CANCELLED` | Full refund to all humans; pool = 0 | Admin cancel path |
| 12 | Orphan: `RUNNING` tournament, room dead 12h+ | `FINISHED` | `processTournamentFinishResults` runs | Orphan reconcile |
| 13 | ABANDONED: refund idempotency (director tick fires twice) | `ABANDONED` (unchanged) | No double refund | Idempotent `externalRef` |
| 14 | Ghost stack sits, converts, then immediately disconnects | DC player rules apply | No change in money state | Ghost → DC transition |
| 15 | 3 humans; 2 busted; 1 remains; tournament not yet FINISHED (still dealing) | `RUNNING` | No payout yet | One-human-remaining check |
| 16 | Late-reg human registers after official start (first deal already occurred) | Seated as active player (not ghost) | Entry fee deducted, prizePoolCents +fee | Late-reg post-start join |
| 17 | All ghost stacks + bots; no human ever sits; max blind reached | `ABANDONED` | Full refund to all registered humans | Ghost-only tournament abandon |
| 18 | FINISHED: `processTournamentPayouts` called twice (crash/retry) | Second call is no-op | No double payout | Payout idempotency |
| 19 | Exactly 2 humans; both bust on same hand (all-in vs all-in) | Assign finishPlaces by chip count going in; winner determined | Winner gets 100% pool | Simultaneous bust resolution |
| 20 | Bot finishes in a "paid" overall position; human finishes lower | Payout assignment skips bot; next human gets that slot | No payout to bot | Bot payout exclusion |
