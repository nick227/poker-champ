# Poker Bots – Integration Summary

How the poker bot feature integrates with the engine, persistence, room, and client as of the current implementation.

---

## 1. Overview

Bots are AI-controlled players that join tables, act on their turn via server-side logic, and are treated like human players for game flow. They use the same action pipeline (`handleAction`), appear in hand history, but bypass the ledger and CashierService.

---

## 2. Identity & State

### 2.1 PlayerState

| Field   | Human | Bot   | Notes                                      |
|---------|-------|-------|--------------------------------------------|
| `id`    | userId | bot_xyz | `bot_<nanoid(10)>` from `newBotId()`      |
| `userId`| userId | `""`  | Empty; no authenticated user               |
| `kind`  | `"HUMAN"` | `"BOT"` | Used for ledger and orchestration logic |
| `name`  | from auth | e.g. "Bot" | Display name                         |

**Location:** `src/state/PlayerState.ts`

### 2.2 Bot IDs

- `newBotId()` → `bot_<nanoid(10)>`
- **Location:** `src/engine/bots/botIds.ts`

---

## 3. Action Flow

### 3.1 Unified Path

Both humans and bots go through `dealer.handleAction(id, payload)`:

- **Human:** Client sends `ACTION` → PokerRoom → `handleAction(userId, payload)`
- **Bot:** Server detects bot’s turn → `maybeActForBot()` → `BotBrain.pickAction()` → `handleAction(botId, payload)`

Validation and state updates are identical.

### 3.2 Bot Turn Detection

`maybeActForBot()` chains the bot action to the action queue (does not await), so:
- No race: the bot runs before any human action sent during the 800ms delay.
- No deadlock: the human's callback completes after chaining; the bot runs as the next queued item.

Runs after:

- `_handleAction` (after advancing `toActSeat`)
- `advanceStreetOrShowdown`
- `startHand`
- `addBot`, `removePlayer`, `removeBot`

Logic:

1. If `street === "WAITING"` → return
2. If `toActSeat` is not a BOT → return
3. Build `BotActionContext` from `buildHeroActionOptions`, hand, seat
4. Wait 800 ms
5. Call `botBrain.pickAction(ctx)` → get `ActionPayload`
6. Call `handleAction(botId, payload)`

### 3.3 Snapshot Reason

- Human action → `reason: "ACTION_ACCEPTED"`
- Bot action → `reason: "BOT_ACTION"`

---

## 4. Bot Brain

### 4.1 Interface

```ts
interface BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload;
}
```

`BotActionContext` includes:

- `heroActionOptions` (canFold, canCheck, canCall, canBet, canRaise, canAllIn, amounts)
- `handSnapshot` (street, potCents, roundCurrentBetCents, board)
- `seatSnapshot` (stackCents, roundBetCents, seat)

### 4.2 RandomBotBrain (MVP)

- Collects valid actions from `heroActionOptions`
- Chooses one uniformly at random
- For BET/RAISE: amount in `[minRaiseTo, maxRaiseTo]` in 100-cent steps

**Location:** `src/engine/bots/BotBrain.ts`

---

## 5. Economy & Persistence

### 5.1 Ledger Bypass

`isLedgerParticipant(player)`:

```ts
return player.kind === "HUMAN";
```

**Location:** `src/engine/persistence/ledgerHelpers.ts`

### 5.2 PersistenceFacade

For `postBlind`, `debitBet`, `creditRefund`, `creditPayout`:

- If `!isLedgerParticipant(player)`:
  - Bots: in-memory only (Dealer updates `stackCents`)
  - Skip LedgerService and BalanceTransaction
- Humans: unchanged, use Ledger as before

All these methods take `player: PlayerState` in addition to existing params.

### 5.3 Hand History

- Bots are written via `HandHistoryService.ensureTableAndPlayers`
- `HandAction`, `HandPayout`: `HandHistoryService` exposes these, but the Dealer does not call them (for humans or bots). Hand/HandPlayer are created via `startHand` where wired; action/payout recording would need to be added if full replay is required.
- `assertHandBalanced` only covers humans; bot chips are not in the ledger

---

## 6. Dealer Integration

### 6.1 addBot(botId, name, buyInCents)

1. Validate seat and buy-in
2. Create `PlayerState` with `kind: "BOT"`, `userId: ""`, `stackCents = buyInCents`
3. No CashierService
4. If persistence enabled, call `ensureTableAndPlayers` for the bot
5. Emit snapshot, call `maybeActForBot()`
6. Start hand if ≥2 non-out players

### 6.2 removeBot(botId)

1. Clear seat, remove from state, no CashierService
2. Emit snapshot, call `maybeActForBot()`
3. If hand in progress: handle next to-act / finish hand if needed

### 6.3 startHand Guard

```ts
if (this.countActiveHumanPlayers() === 0) return;
```

`countActiveHumanPlayers()` counts humans who are ACTIVE, not OUT/ABANDONED, and have chips. Prevents endless bot-vs-bot hands when the only human is sitting out (e.g. ABANDONED, disconnected, or busted).

---

## 7. Room / API

### 7.1 ADD_BOT

- **Message:** `{ type: "ADD_BOT", payload: { name?, buyInCents } }`
- **Auth:** Sender must be seated (`userIdBySessionId` lookup)
- **Flow:** `newBotId()` → `dealer.addBot(botId, name, buyInCents)`

### 7.2 REMOVE_BOT

- **Message:** `{ type: "REMOVE_BOT", payload: { botId } }`
- **Auth:** Sender must be seated
- **Flow:** `dealer.removeBot(botId)`

**Location:** `src/rooms/PokerRoom.ts`

**Contract:** `packages/realtime-contract/src/table.ts` (AddBotPayloadSchema, RemoveBotPayloadSchema)

---

## 8. Client Integration

### 8.1 Add Bot

- "+ Bot" in table top bar (when seated and `buyInCents` known)
- Calls `dispatchAddBot({ tableId, buyInCents })` → sends `ADD_BOT` over WebSocket

### 8.2 Remove Bot

- Tap bot in opponent strip
- Calls `dispatchRemoveBot({ tableId, botId: o.id })` → sends `REMOVE_BOT`

### 8.3 Bot Display

- `TableSeatSnapshot` includes `isBot: boolean`
- `mapSeatsToOpponents` passes `isBot` into `Opponent`
- Opponent strip shows `🤖` next to bot names
- Tap on bot → remove; tap on human → player popup

**Store:** `dispatchAddBot`, `dispatchRemoveBot` in `multitable.store.ts`

---

## 9. Verification Summary

| Item | Status |
|------|--------|
| **Race during 800ms delay** | Fixed: `maybeActForBot()` chains the bot action to the queue instead of awaiting; bot runs as next queued item, before any human action sent during the delay. |
| **Bot wins / creditPayout** | Correct: `PersistenceFacade.creditPayout` returns `currentBalance + amountCents` when `!isLedgerParticipant(player)`; Dealer sets `winner.stackCents = next`. |
| **HandAction / HandPayout** | Not wired: Dealer does not call `handHistory.recordAction` or `recordPayout` for any player; would need to be added if full replay is required. |

---

## 10. File Map

| File | Responsibility |
|------|----------------|
| `src/state/PlayerState.ts` | `kind`, `userId` for bots |
| `src/engine/bots/botIds.ts` | `newBotId()` |
| `src/engine/bots/BotBrain.ts` | Interface + RandomBotBrain |
| `src/engine/persistence/ledgerHelpers.ts` | `isLedgerParticipant()` |
| `src/engine/persistence/PersistenceFacade.ts` | Ledger bypass for bots |
| `src/engine/Dealer.ts` | addBot, removeBot, maybeActForBot, startHand guard |
| `src/rooms/PokerRoom.ts` | ADD_BOT, REMOVE_BOT handlers |
| `packages/realtime-contract/src/table.ts` | Schemas, BOT_ACTION reason |
| `apps/client/src/stores/multitable.store.ts` | dispatchAddBot, dispatchRemoveBot |
| `apps/client/src/components/domain/table/table.adapter.ts` | mapSeatsToOpponents with isBot |
| `apps/client/src/components/domain/table/OpponentStrip.tsx` | Bot label, tap-to-remove |
| `apps/client/app/table/[id].tsx` | + Bot button, onPlayerPress logic |

---

## 11. Data Flow Diagram

```
[Client] "+ Bot" click
    → dispatchAddBot
    → WebSocket ADD_BOT { name, buyInCents }
    → PokerRoom.onMessage
    → dealer.addBot(botId, name, buyInCents)
    → PlayerState created (kind=BOT)
    → maybeActForBot() if bot is first to act

[Dealer] After any turn advance / street / hand start
    → maybeActForBot()
    → if toAct is BOT: build context → botBrain.pickAction → handleAction
    → PersistenceFacade.debitBet (skips Ledger for bot)
    → snapshot with reason BOT_ACTION
    → maybeActForBot() (next bot if applicable)

[Client] Tap bot avatar
    → dispatchRemoveBot
    → WebSocket REMOVE_BOT { botId }
    → dealer.removeBot(botId)
    → maybeActForBot()
```
