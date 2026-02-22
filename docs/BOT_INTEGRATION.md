# Bot Integration

This document explains how bots fit into the poker game: how they differ from and resemble human players, and the rules for adding and removing them. It complements `POKER_BOTS_INTEGRATION.md` (technical integration) and `BOT_MID_HAND_JOIN_FLOW.md` (mid-hand join behavior).

---

## 1. Bots vs Humans — Similarities and Differences

### 1.1 Similarities

| Aspect | Shared behavior |
|--------|------------------|
| **Seat** | Both occupy a seat at the table and use the same `seats[]` and `playersById` state. |
| **Action flow** | Both use `handleAction(id, payload)`. Bots call it via `maybeActForBot()` → `BotBrain.pickAction()`; humans via client `ACTION` messages. |
| **Game rules** | Same betting options (CHECK, CALL, BET, RAISE, ALL_IN, FOLD), turn order, pot logic, and hand resolution. |
| **PlayerState** | Same schema: seat, stackCents, status, roundBetCents, committedCents, needsAction, sittingOutUntilNextHand. |
| **Join mid-hand** | Both sit out until the next hand when added mid-hand (see §2). |
| **Hand history** | Both can be recorded in hand history for replay and identity. |

### 1.2 Differences

| Aspect | Human | Bot |
|--------|-------|-----|
| **Identity** | `userId` from auth; `kind = "HUMAN"` | `userId = ""`; `kind = "BOT"`; `id = bot_<nanoid>` |
| **Connection** | Has Colyseus client; can disconnect, reconnect, time out | Always `connected = true`; no WebSocket |
| **Economy** | CashierService, ledger, bankroll | No ledger; buy-in is in-memory only |
| **Turn execution** | Waits for client `ACTION` | Server calls `maybeActForBot()` → `BotBrain.pickAction()` → `handleAction` |
| **Leave** | Consented leave (client disconnect) or abandon timeout | Only removed by user via `REMOVE_BOT` or when no humans left |
| **Control** | User joins/leaves via lobby; actions via table | Users add/remove bots via table; no bot self-join |

---

## 2. Bot Join Rules — “Sit Out Until Next Hand”

### 2.1 When a bot is added

- **During `street === "WAITING"`** (between hands): Bot is created with `status = "ACTIVE"`, `sittingOutUntilNextHand = false`. On the next `startHand()`, the bot is dealt in.
- **During an active hand** (`street !== "WAITING"`): Bot is created with `status = "ABANDONED"`, `sittingOutUntilNextHand = true`. The bot:
  - Occupies a seat and appears in snapshots
  - Does not participate in the current hand (not dealt hole cards, no action)
  - Is excluded from `eligibleToAct()` and `resolveActivePlayersForHand()`
  - On the *next* `startHand()`, `sittingOutUntilNextHand` is cleared and the bot becomes eligible for the new hand

**Source:** `PlayerLifecycleService.addBot()`, `HandLifecycleService.startHand()`, `resolveActivePlayersForHand()` in `TableNavigator.ts`.

### 2.2 Same rule for humans

Humans who join mid-hand follow the same logic: `status = "ABANDONED"`, `sittingOutUntilNextHand = true`. They sit out until the next hand and then are dealt in. See `PlayerLifecycleService.addPlayer()`.

---

## 3. Bot Remove Rules — “Only Between Hands or When Stopped”

### 3.1 Desired UX rule

Users may remove bots:

- **Between hands** — when `street === "WAITING"` (no hand in progress)
- **When stopped** — same as between hands; table is idle

Users may *not* remove bots **during an active hand** — i.e., while `street !== "WAITING"` and a hand is in progress (PREFLOP, FLOP, TURN, RIVER, or runout).

### 3.2 Rationale

- Avoids mid-hand state disruption (pot, toAct, side pots)
- Keeps hand continuity and fairness predictable
- Simpler client: “Remove” disabled or hidden during a hand

### 3.3 Implementation

The `REMOVE_BOT` handler rejects when `state.street !== "WAITING"` with `ERROR` code `REMOVE_BOT_NOT_ALLOWED`. Bots can only be removed between hands or when the table is stopped.

---

## 4. When Bots Are Auto-Removed

The room calls `maybeRemoveBotsIfNoHumans()` when a human leaves (consented leave). If `humanCount === 0`, all bots are removed. This avoids bot-only tables.

**Source:** `PokerRoom.onLeave()` → `handleConsentedLeave()` → `maybeRemoveBotsIfNoHumans()`.

---

## 5. Flow Summary

```
Add Bot (ADD_BOT)
  street === "WAITING"  →  Bot ACTIVE, dealt in next hand
  street !== "WAITING"  →  Bot ABANDONED, sittingOutUntilNextHand=true
                           Seat visible; not in current hand
                           Next startHand() → bot eligible for new hand

Remove Bot (REMOVE_BOT)
  Allowed:  street === "WAITING"  (between hands / stopped)
  Rule:     Not during active hand (enforced in room)
  Auto:     All bots removed when last human leaves
```

---

## 6. Related Docs

| Doc | Purpose |
|-----|---------|
| `POKER_BOTS_INTEGRATION.md` | Engine, room, client wiring; economy bypass; action flow |
| `BOT_MID_HAND_JOIN_FLOW.md` | Mid-hand add behavior; invariants; tests |
| `PLAYER_JOIN_LEAVE_DISCONNECT_DEEP_DIVE.md` | Human join/leave; disconnect; remove semantics |
| `SITTING_OUT_AND_TABLE_COUNT_PROPOSAL.md` | Sitting out, bot removal when no humans |

