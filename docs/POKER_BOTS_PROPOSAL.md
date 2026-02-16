# Poker Bots Proposal

## 1. Overview

This document proposes the design for **poker bots**: AI-controlled players that can be added to tables and participate in games. Bots are treated mostly like human players by the engine—they occupy seats, receive hole cards, act on their turn, and their actions are recorded. The key difference is that **decision-making happens server-side**, not from a connected client.

**Scope**:
- **MVP / POC**: Bots addable to games; return a random but valid action that flows through the normal event pipeline.
- **Future**: Weight decisions by hand strength, bankroll, opponent action, and board texture—potentially encoding Nick's poker preferences as a "logical engine."

---

## 2. Design Principles

1. **Unified flow**: Bot actions use the same `dealer.handleAction(id, payload)` path as human actions. No special-case branches in the core game logic.
2. **Server-authoritative**: Bots never connect via WebSocket. The server detects "bot's turn" and invokes the bot brain internally.
3. **Full audit trail**: Bot actions are recorded in `HandAction`, `Hand`, and `HandPayout` (hand history)—same as humans; ledger is human-only for MVP.
4. **Pluggable brain**: The decision engine is a replaceable component—start with random, later swap in a weighted/logical engine.

---

## 3. Integration Points (Current Architecture)

### 3.1 Player Lifecycle

| Flow | Human | Bot |
|------|-------|-----|
| Add | `PokerRoom.onJoin` → `dealer.addPlayer(userId, name, buyIn)` | New: `dealer.addBot(botId, name, buyIn)` |
| Remove | `dealer.removePlayer(userId)` (cash out via CashierService) | `dealer.removeBot(botId)` (cash out via bot-specific path) |
| Turn | Client sends `ACTION` → `dealer.handleAction(userId, payload)` | Server detects bot turn → `BotBrain.pickAction()` → `dealer.handleAction(botId, payload)` |

### 3.2 Action Flow (Unchanged for Both)

```
[Human] Client → PokerRoom.onMessage("ACTION") → dealer.handleAction(userId, payload)
[Bot]   Dealer/Room → BotBrain.pickAction(context) → dealer.handleAction(botId, payload)
```

Both paths converge at `_handleAction`, which validates turn, eligibility, and amount, then mutates state and advances `toActSeat`. The engine does not care whether the action originated from a websocket or from an internal bot call.

### 3.3 Turn Detection

Today, the dealer advances `toActSeat` and broadcasts a snapshot. Clients see `hero.actionOptions` when it's their turn. For bots:

- When `toActSeat` points to a bot, **no client will ever have that bot as their hero**.
- We need a **post-snapshot hook** or **polling step**: after emitting a snapshot (e.g. `ACTION_ACCEPTED`, `AUTO_TRANSITION`, `HAND_START`), check if `toActSeat` is occupied by a bot. If yes, schedule a bot action.

---

## 4. Bot Identity & Economy

### 4.1 PlayerState.kind

Use an explicit `kind` field instead of string-prefix parsing:

```ts
// PlayerState
kind: "HUMAN" | "BOT" = "HUMAN"
```

- **Why**: Cleaner than `id.startsWith("bot_")`; avoids accidental collisions; makes future persistence easier.
- **MVP**: Set `p.kind = "BOT"` when adding a bot. Human players default to `"HUMAN"`.

Bot IDs remain `bot_<uuid>` (e.g. `bot_a1b2c3d4`) for uniqueness—but **do not rely on string prefix for logic**. Always use `p.kind === "BOT"` to detect bots.

### 4.2 userId Semantics

**Do not** set `p.userId = botId` for bots.

```ts
// Bot
p.id = "bot_xyz";
p.userId = null;  // semantically: no authenticated User

// Human
p.id = userId;
p.userId = userId;
```

- **Why**: `userId` means authenticated user; prevents accidental joins to User table; future bot persistence stays cleaner.

### 4.3 Economy / Bankroll (MVP: Maximum Simplicity)

Bots **never touch LedgerService** at all.

Centralize in **one** helper to prevent drift:

```ts
// src/engine/persistence/ledgerHelpers.ts or similar
function isLedgerParticipant(player: PlayerState): boolean {
  return player.kind === "HUMAN";
}
```

PersistenceFacade (postBlind, debitBet, creditPayout, creditRefund)—caller passes `player`:

```ts
if (!isLedgerParticipant(player)) return;  // Dealer mutates stackCents; skip ledger
```

**Skip for bots**: postBlind ledger, debitBet ledger, creditPayout ledger.

**Still record**: HandAction, Hand, HandPayout (hand history)—gives full audit trail.

**Result**: Humans fully ledgered; bots purely in-memory; clean boundary.

---

## 5. Bot Brain (Decision Engine)

### 5.1 Interface

The brain receives a **snapshot-shaped context**, not raw engine state. Keeps brain isolated from engine internals.

```ts
// src/engine/bots/BotBrain.ts
export interface BotActionContext {
  heroActionOptions: HeroActionOptions;
  handSnapshot: {
    street: Street;
    potCents: number;
    roundCurrentBetCents: number;
    board: string[];
    // ... other hand-level fields the brain needs
  };
  seatSnapshot: {
    stackCents: number;
    roundBetCents: number;
    seat: number;
    // ... other seat-level fields the brain needs
  };
}

export interface BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload;
}
```

### 5.2 MVP Implementation: RandomBotBrain

Given `heroActionOptions` from the context, the random brain:

1. Collect all *currently legal* actions from the options: e.g. `[FOLD, CHECK]` or `[FOLD, CALL, RAISE, ALL_IN]`.
2. With equal probability, pick one.
3. For BET/RAISE: pick amount uniformly in `[minRaiseTo, maxRaiseTo]` (or round to sensible increments).
4. Return `{ action, amountCents? }` conforming to `ActionPayload`.

This guarantees a **valid** action that will pass `_handleAction` validation.

### 5.3 Future: Weighted / Logical Engine

- Inputs: `holeCards`, `board`, `potCents`, `stackCents`, `opponentStacks`, `street`, `callAmount`, position, etc.
- Output: Same `ActionPayload`.
- Logic: Encode Nick's preferences (e.g. fold weak hands, raise strong, bluff frequency, pot odds). Can start as simple heuristics, later as a small decision tree or scripted rules.

---

## 6. Dealer Integration

### 6.1 Add Bot

```ts
async addBot(botId: string, name: string, buyInCents: number) {
  if (this.state.playersById.has(botId)) return;
  const seat = this.findOpenSeat();
  if (seat === -1) throw new PokerError("TABLE_FULL", "Table is full.");
  this.assertValidBuyIn(buyInCents);

  const p = new PlayerState();
  p.id = botId;
  p.userId = null;  // no authenticated User; empty string looks like valid FK to ORMs
  p.kind = "BOT";
  p.name = name;
  p.seat = seat;
  p.status = "ACTIVE";
  p.connected = true;  // bots are always "connected"
  p.stackCents = buyInCents;

  this.state.playersById.set(botId, p);
  this.state.seats[seat] = botId;

  this.sendTableSnapshotToAll("SEAT_CHANGE");
  await this.maybeActForBot();  // seat change can make bot first to act

  if (this.countNonOutPlayers() >= 2 && this.state.street === "WAITING") {
    await this.startHand();
  }
}
```

### 6.2 Safety Guard: No Bot-Only Hands

Prevent infinite unattended hands when the table has only bots:

```ts
// Before startHand
if (this.countHumanPlayers() === 0) return;  // do not start hand
```

- **Why**: Otherwise the server could run infinite hands with no human at the table.
- **MVP**: `countHumanPlayers() === 0` → skip `startHand`. Simple and sufficient.

### 6.3 Bot Orchestration

**Preferred (post-MVP)**: Move bot orchestration out of Dealer into a `BotOrchestrator`.

- Dealer emits events: `onTurnAdvanced`, `onHandStart`, `onStreetAdvanced`.
- `BotOrchestrator` subscribes and, when `toActSeat` is a bot, calls `BotBrain.pickAction()` then `dealer.handleAction(botId, payload)`.
- **Dealer stays pure game engine**; bots become an engine extension.

**MVP**: Inline `maybeActForBot()` inside Dealer is acceptable. Migrate to `BotOrchestrator` when refactoring.

```ts
// MVP: inside Dealer
private async maybeActForBot() {
  if (this.state.street === "WAITING") return;

  const toActId = this.state.seats[this.state.toActSeat] ?? "";
  const p = this.state.playersById.get(toActId);
  if (!toActId || !p || p.kind !== "BOT") return;
  if (!eligibleToAct(p) || !p.needsAction) return;

  const options = this.buildHeroActionOptions(toActId);
  if (!options) return;

  const ctx: BotActionContext = {
    heroActionOptions: options,
    handSnapshot: { street: this.state.street, potCents: this.state.potCents, roundCurrentBetCents: this.state.roundCurrentBetCents, board: [...this.state.board] },
    seatSnapshot: { stackCents: p.stackCents, roundBetCents: p.roundBetCents, seat: p.seat },
  };
  await this.delay(BOT_ACTION_DELAY_MS);
  const payload = this.botBrain.pickAction(ctx);
  await this.handleAction(toActId, payload);
}
```

Invoke `maybeActForBot()` from:

- End of `_handleAction` (after advancing `toActSeat` and sending snapshot)
- End of `advanceStreetOrShowdown`
- End of `startHand`
- After **seat changes** that can make a bot first to act: `addBot()`, `removePlayer()`, `removeBot()`

Prevents deadlocks when a bot becomes next actor via seating change.

### 6.4 Persistence Considerations (MVP)

- **HandHistoryService**: Uses `playerId`. Create/upsert `PokerPlayer` for bots (with `userId: null`). **Still record**: HandAction, Hand, HandPayout.
- **LedgerService**: Bots **never** touch it. Use `isLedgerParticipant(player)`; if false, skip Ledger and return.

---

## 7. Room / API Integration

### 7.1 Adding a Bot (Who Triggers?)

- **Option A**: Admin/Host message. e.g. `ADD_BOT { name, buyInCents }`. Requires host/admin role.
- **Option B**: Table creation options. e.g. `createTable({ ..., botCount: 2 })`.
- **Option C**: Lobby/Table UI. "Add bot" button visible to table creator or all seated players.

**Recommendation (MVP)**: Option A. A simple `ADD_BOT` message on the room, authorized for table host or any seated player (or restricted to dev mode). Room calls `dealer.addBot(newBotId(), name, buyInCents)`.

### 7.2 Removing a Bot

- `REMOVE_BOT { botId }` or "Sit out" / "Remove" in UI.
- `dealer.removeBot(botId)`: clear seat, remove from state (MVP: no User credit). Call `maybeActForBot()` at end—seat change can make a bot next to act.

---

## 8. Blinds & In-Hand Ops for Bots

All in-hand ops go through PersistenceFacade. Use `isLedgerParticipant(player)`; if false, return (Dealer already mutates stackCents).

- **assertHandBalanced**: Ledger sums only human `BalanceTransaction`s. Exclude bots from balance assertion for MVP; HandAction still provides audit trail.

### 8.1 Snapshot Reason: BOT_ACTION

Add to `SnapshotReasonEnum`:

```ts
"BOT_ACTION"  // when bot acts (vs ACTION_ACCEPTED for human)
```

When emitting after an action: if actor is bot, use `reason: "BOT_ACTION"`; else `"ACTION_ACCEPTED"`. Zero behavior change, but debugging/logs clearly distinguish human vs bot actions.

---

## 9. File Structure (Proposed)

```
src/
  engine/
    bots/
      BotBrain.ts        # interface + RandomBotBrain
      botIds.ts          # newBotId()
    persistence/
      ledgerHelpers.ts   # isLedgerParticipant(player)
      PersistenceFacade.ts
    BotOrchestrator.ts   # optional post-MVP
    Dealer.ts            # addBot, removeBot, maybeActForBot (MVP)
  state/
    PlayerState.ts       # kind: "HUMAN" | "BOT", userId?: string | null
  rooms/
    PokerRoom.ts         # ADD_BOT, REMOVE_BOT handlers
```

Hand history: rely on existing `ensureTableAndPlayers()`; no separate `ensureBotPersistence`.

---

## 10. MVP Implementation Checklist

1. [ ] Add `kind: "HUMAN" | "BOT"` to PlayerState; humans default to `"HUMAN"`.
2. [ ] Add `newBotId()` helper (returns `bot_<uuid>`).
3. [ ] Implement `BotBrain` interface and `RandomBotBrain` (context: heroActionOptions, handSnapshot, seatSnapshot).
4. [ ] Implement `Dealer.addBot` and `Dealer.removeBot`; bots use `userId = null`, `kind = "BOT"`.
5. [ ] Add `isLedgerParticipant(player)`; PersistenceFacade uses it to skip Ledger for bots.
6. [ ] Add `countHumanPlayers()`; guard `startHand` with `if (countHumanPlayers() === 0) return`.
7. [ ] Add `maybeActForBot()`; call from `_handleAction`, `advanceStreetOrShowdown`, `startHand`, `addBot`, `removePlayer`, `removeBot`.
8. [ ] Add `BOT_ACTION` to SnapshotReasonEnum; use it when emitting after bot action.
9. [ ] Wire `ADD_BOT` and `REMOVE_BOT` in PokerRoom.
10. [ ] Add `BOT_ACTION_DELAY_MS` (e.g. 500–1500 ms) for UX.
11. [ ] Client: "Add bot" control (table screen or dev panel).

### Implementation Task List (Concise)

1. **PlayerState**: Add `kind: "HUMAN" | "BOT"`; add `userId?: string | null` (schema supports null for bots).
2. **Helpers**: `newBotId()`, `isLedgerParticipant(player)`, `countHumanPlayers()`.
3. **BotBrain**: Interface + RandomBotBrain; context = `{ heroActionOptions, handSnapshot, seatSnapshot }`.
4. **Dealer**: `addBot`, `removeBot`, `maybeActForBot`; guard `startHand` if no humans.
5. **PersistenceFacade**: Pass `player`; `if (!isLedgerParticipant(player)) return` before Ledger calls.
6. **Snapshot**: Add `BOT_ACTION` to enum; use when bot acts.
7. **Room**: `ADD_BOT`, `REMOVE_BOT` message handlers.
8. **Client**: "Add bot" button.
9. **Hand history**: Reuse `ensureTableAndPlayers` for bots at add (skip `ensureBalances`); no separate `ensureBotPersistence`.

---

## 11. Future Extensions

- **BotOrchestrator**: Extract bot turn logic from Dealer; subscribe to Dealer events.
- **Weighted engine**: Replace `RandomBotBrain` with `WeightedBotBrain` using hand strength, pot odds, position.
- **Nick's logical engine**: Encode explicit rules (e.g. "fold 72o from UTG", "3-bet AA").
- **Bot personalities**: Different brains per bot (tight/aggressive, loose/passive).
- **Full persistence**: Bot balance in DB via dedicated BotBalance table (no synthetic User).
- **Replay / analysis**: Hand history already captures bot actions; build replay and analytics on top.

---

## 12. Summary

Bots integrate by reusing the existing action pipeline: `dealer.handleAction(id, payload)`. The server detects when it's a bot's turn (via `p.kind === "BOT"`) and feeds a `BotBrain`-generated payload into that same path. `PlayerState.kind` and `userId = null` for bots keep identity clear; PersistenceFacade bypasses Ledger for bots, mutating `PlayerState.stackCents` only. Hand history (HandAction, HandPayout) still records bot actions. A `countHumanPlayers() === 0` guard prevents bot-only hands. The design keeps the engine DRY; bot orchestration can later move to a `BotOrchestrator` that subscribes to Dealer events.
