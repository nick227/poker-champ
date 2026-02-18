# Player Join, Leave, Disconnect & Timeout — Deep Dive

This document describes how the server handles **new players joining** (and waiting until the next hand), **players leaving** (consented or removed), **disconnects**, and **timeouts**, including when it is or isn’t the player’s turn. It references real code paths and suggests hardening options.

---

## 1. New players joining — “wait until next hand”

### 1.1 Entry point

- **HTTP join**: `LobbyRouter` validates and redirects to the table; the client then connects to the **PokerRoom** over the realtime transport.
- **Realtime join**: `PokerRoom` handles a join message (e.g. `TABLE_JOIN`), validates auth and buy-in, then calls:
  - `src/rooms/PokerRoom.ts` (join handler) → `this.dealer.addPlayer(userId, name, buyInCents)` (around line 405).

### 1.2 Add player flow (code)

**`src/engine/dealer/services/PlayerLifecycleService.ts` — `addPlayer()`**

1. **Already seated**: If `state.playersById.has(userId)` → return no plans (idempotent).
2. **Seat**: `findOpenSeat(state)` (`src/engine/dealer/utils/TableNavigator.ts`) returns the first empty slot in `state.seats`. If none (`-1`) → `PokerError("TABLE_FULL")`.
3. **Buy-in**: `CashierService.processCashGameBuyIn()`; on `INSUFFICIENT_BANKROLL` → throw.
4. **New `PlayerState`**: Created with `status = "ACTIVE"`, `connected = true`, `disconnectDeadlineTs = 0`, no hole cards.
5. **State update**: `state.playersById.set(userId, player)`, `state.seats[seat] = userId`.
6. **toAct invariant**: `ensureToActHasNeedsActionIfNeeded(seat, userId)` so if this seat is currently `toActSeat` in an open betting round, that player has `needsAction = true` (avoids “no eligible player marked needsAction”).
7. **Plans**:
   - Always: `EMIT_SNAPSHOT` with reason `"SEAT_CHANGE"`.
   - If `countNonOutPlayers(state) >= 2` **and** `state.street === "WAITING"` → `START_HAND`.
   - Else → `MAYBE_AUTOMATE_TURN` (hand already in progress; new player does not join the current hand).

So: a player who joins **while a hand is in progress** is added to the table and gets a snapshot, but **no** `START_HAND`. They are not in the current hand.

### 1.3 When does a hand start? Who is dealt in?

**`src/engine/dealer/services/HandLifecycleService.ts` — hand start (simplified)**

- Hand start runs when the Dealer executes a `START_HAND` plan (only when `street === "WAITING"` and ≥2 non-out players).
- **Who gets hole cards**:  
  `const activePlayers = [...iterPlayersInSeatOrder(state)].filter((player) => player.status === "ACTIVE");`  
  Only players who are **in state** and **status === "ACTIVE"** at the moment of hand start get dealt in. SB/BB and `toActSeat` are derived from this set.

So:

- **Join during `street === "WAITING"`** (e.g. 2nd player joins) → `START_HAND` is pushed → that hand starts with the new player in it.
- **Join during an active hand** (`street !== "WAITING"`) → no `START_HAND` → new player is **not** in the current hand; they sit out until the next hand. The next hand is started later by `scheduleNextHand` (e.g. after hand end); at that time the new player is already in `state` with `ACTIVE`, so they **are** included in the next hand.

**Conclusion**: “Wait until next hand” is enforced by: (1) only pushing `START_HAND` when `street === "WAITING"`, and (2) building `activePlayers` at hand-start time from current `state.playersById` with `status === "ACTIVE"`. No explicit “sit out next hand” flag; joining mid-hand simply doesn’t trigger a hand start.

---

## 2. Players leaving

### 2.1 Consented leave (user clicks leave)

**`src/rooms/PokerRoom.ts` — `onLeave(client, code)`**

- If `code === CloseCode.CONSENTED`:
  - `this.dealer.handleConsentedLeave(userId)` (around line 456).
  - Then persistence (e.g. `TableSeatSessionService.markLeft`) and metadata update.

**`src/engine/Dealer.ts` — `handleConsentedLeave(userId)`**

```ts
async handleConsentedLeave(userId: string) {
  await this.forceFoldForLeave(userId);
  await this.removePlayer(userId, { cashOutAfterRemoval: true });
}
```

**`forceFoldForLeave`** (same file): calls `actionService.executeForcedFold({ state, userId, ... })`.

**`src/engine/dealer/services/ActionService.ts` — `executeForcedFold()`**

- If no player, or `street === "WAITING"`, or `runoutMode === "STAGED"`, or player not `ACTIVE` → `NO_OP`.
- Otherwise: record FOLD, set `player.status = "FOLDED"`, `clearPlayerNeedsAction(player)`.
- If only one not folded → `HAND_FINISHED`.
- Else if all remaining all-in or folded → `STREET_COMPLETE` (runout).
- Else if round complete or no further betting → `STREET_COMPLETE`.
- Else if **current player was toAct** (`state.toActSeat === player.seat`):  
  `nextSeat = findNextToActSeat(state, player.seat)`, then `state.toActSeat = nextSeat` (or `STREET_COMPLETE` if none).
- So: **consented leave always forces a fold** (whether or not it was their turn), then **removePlayer** with cash-out.

**`removePlayer`** (PlayerLifecycleService): clears seat, deletes from `playersById` / `holeCardsByPlayerId`, then pushes:

- `EMIT_SNAPSHOT` reason `"SEAT_CHANGE"`.
- `ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL` with `removedSeat`.

So: on consented leave we **fold first**, then remove; if it was their turn, turn advances to the next eligible seat; then removal logic runs.

### 2.2 Removal without consent (e.g. bot remove, seat TTL, kick)

**Remove bot**: `PokerRoom` (e.g. message handler) → `this.dealer.removeBot(botId)`.

**Remove human** (e.g. seat TTL): `PokerRoom.runPersistentSeatCleanup()` → for soft-expired sessions, if player still in room and not connected → `this.dealer.removePlayer(userId)` (no forced fold; player is just removed).

**`src/engine/dealer/services/PlayerLifecycleService.ts` — `removePlayer()` / `removeBot()`**

- Cash-out (or not) per options; clear seat and delete player from state; push `EMIT_SNAPSHOT` and **`ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL`**.

So: **leave-without-consent does not force fold**. The player is removed from the table; if they were toAct or in the hand, advancement is handled by `ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL`.

### 2.3 Ensuring hand advances after removal

**`src/engine/Dealer.ts` — `ensureHandAdvancingAfterPlayerRemoval(removedSeat)`**

- If `street === "WAITING"`: optionally start a hand if ≥2 non-out players; return.
- If `runoutMode === "STAGED"`: return.
- If ≤1 not folded → `finishHandByLastStanding()`.
- Else:
  - `toActId = state.seats[state.toActSeat]`, `toAct = state.playersById.get(toActId)`.
  - If there is **no** valid toAct (missing or not eligible or no `needsAction`):
    - If round complete or no further betting → `advanceStreetOrShowdown()`.
    - Else: `nextSeat = findNextToActSeat(state, removedSeat)`; if `-1` → `advanceStreetOrShowdown()`, else `state.toActSeat = nextSeat` and `maybeActForBot()`.
  - Else: `maybeActForBot()` (current toAct still valid).

So: when a player is **removed** (leave or bot remove), we fix `toActSeat` if the removed player was toAct or left the previous toAct invalid (e.g. empty seat), and we advance street or runout when needed. We do **not** force-fold the removed player; they just disappear from state (and may already be folded or not in the hand).

---

## 3. Disconnect (grace period, no abandon yet)

### 3.1 When disconnect is signaled

**`src/rooms/PokerRoom.ts` — `onLeave(client, code)`**

- If **not** consented (`code !== CloseCode.CONSENTED`):
  - `deadlineTs = Date.now() + 60_000` (60 seconds).
  - `this.dealer.markDisconnected(userId, deadlineTs)` (line 471).
  - Persistence: e.g. `TableSeatSessionService.markSittingOut(...)`.
  - Then: `reconnected = await this.allowReconnection(client, 60)` (Colyseus 60s reconnection window).
  - On success: bind client, `this.dealer.markReconnected(userId)`, persistence, send `SESSION_RESTORED` and snapshot.
  - On **failure** (timeout / no reconnect):
    - If **persistent seats**: log and **return** — we do **not** call `markAbandoned`; the player stays in state as disconnected.
    - If **no** persistent seats: `await this.dealer.markAbandoned(userId)` (line 502).

So: **disconnect** is “left without consent”; we give a 60s reconnection window. The actual “timeout” is the Colyseus `allowReconnection(60)` promise rejecting. We do **not** periodically check `disconnectDeadlineTs` in the engine; that field is set but the abandon decision is driven by the room’s reconnect outcome.

### 3.2 What markDisconnected does (engine)

**`src/engine/dealer/services/PlayerLifecycleService.ts` — `markDisconnected(userId, disconnectDeadlineTs)`**

- Set `player.connected = false`, `player.disconnectDeadlineTs = disconnectDeadlineTs`.
- Plans: `EMIT_SNAPSHOT` (`"SEAT_CHANGE"`), `MAYBE_AUTOMATE_TURN`.
- No change to `status` or `needsAction`; the player remains ACTIVE in the hand.

So: while in the “disconnected” window, the player is still in the hand. If it’s their turn, **MAYBE_AUTOMATE_TURN** will trigger auto-action (see below).

### 3.3 Auto-action when it’s their turn (disconnected human)

**`src/engine/dealer/services/TurnAutomationService.ts` — `maybeActForBot()`**

- Exits if `street === "WAITING"` or `runoutMode === "STAGED"`.
- Resolves current toAct: `toActId = state.seats[state.toActSeat]`, `player = state.playersById.get(toActId)`.
- If not eligible or no `needsAction` → return.
- If **human and connected** → return (no auto-action).
- If **human and not connected**:  
  `payload = options.canCheck ? { action: "CHECK" } : { action: "FOLD" }`;  
  `currentHandAutoActedUserIds.add(toActId)`;  
  `enqueueAction(toActId, payload)`.

So: **when it’s their turn and they’re disconnected**, we auto-check if legal, else auto-fold, and enqueue that action. The action is applied later via the normal action path; before it runs, we can skip it if the player reconnected (see Dealer’s `enqueueInternalAction`).

**`src/engine/Dealer.ts` — `enqueueInternalAction()`**

- Before applying the queued action: if player is human and `p.connected` → skip the auto-action (“Skipping queued auto-action; player reconnected”).

So: disconnect → markDisconnected → MAYBE_AUTOMATE_TURN enqueues check/fold; if they reconnect before the action runs, we skip it.

---

## 4. Timeout / abandon (reconnect window expired or explicit kick)

### 4.1 When abandon is triggered

- **Reconnect failed** (PokerRoom): only if **persistent seats disabled** → `await this.dealer.markAbandoned(userId)`.
- **Kick (e.g. admin)**: `PokerRoom.kickUserByAdmin()` → `client.leave()` then `this.dealer.kickUser(userId, reason)` → **`this.dealer.markAbandoned(userId)`** (`src/engine/Dealer.ts`).

So: “timeout” in code is “reconnection failed”; we only call `markAbandoned` when persistent seats are off, or when we explicitly kick.

### 4.2 What markAbandoned does (engine)

**`src/engine/dealer/services/PlayerLifecycleService.ts` — `markAbandoned(userId)`**

- Set `player.connected = false`, `disconnectDeadlineTs = 0`, **`player.status = "ABANDONED"`**, **`player.needsAction = false`**.
- Add to `pendingSeatReleaseUserIds` (seat can be released at hand end).
- Plans: `EMIT_SNAPSHOT` (`"SEAT_CHANGE"`).
- If `street === "WAITING"` → `RELEASE_PENDING_SEATS` (then release seats / remove players).
- If ≤1 not folded → `FINISH_HAND_BY_LAST_STANDING`.
- If **current toAct is this player** (`state.toActSeat === player.seat`):
  - If round complete or no further betting → `ADVANCE_STREET_OR_SHOWDOWN`.
  - Else: `nextSeat = findNextToActSeat(state, player.seat)`; if `-1` → `ADVANCE_STREET_OR_SHOWDOWN`, else **`state.toActSeat = nextSeat`** and `MAYBE_AUTOMATE_TURN`.
- Else: `MAYBE_AUTOMATE_TURN` only.

So: **when it’s their turn** we advance `toActSeat` to the next eligible seat (or advance street/showdown); **when it’s not their turn** we only trigger maybeActForBot (e.g. for other disconnected players). The abandoned player stays in the hand (ABANDONED, no longer toAct) until hand end; then `RELEASE_PENDING_SEATS` can remove them.

### 4.3 Auto-action cap (repeated disconnects)

**`src/engine/dealer/services/TurnAutomationService.ts` — `applyDisconnectedAutoActionCapForHand()`**

- Called from hand-end paths (e.g. `finishHandByLastStanding`, `finishHandShowdownWithSidePots`).
- Cap from config: `getAutoActionHandCap()` in `src/config/seats.ts` (env `AUTO_ACTION_HAND_CAP`, default 3).
- For each human who **auto-acted this hand** and is **still disconnected**: increment per-player counter; if count ≥ cap → set **`player.status = "ABANDONED"`**, `player.needsAction = false`, and optional `onAutoSitOutReachedCap` callback.

So: if a human is disconnected and auto-acts (check/fold) for too many hands in a row (≥ cap), they are marked ABANDONED (same as timeout), without waiting for the Colyseus reconnect to expire.

---

## 5. Summary matrix (who does what, when)

| Scenario | It’s their turn? | Behavior (code path) |
|----------|-------------------|----------------------|
| **New player joins** | N/A | Add to table; if `street === "WAITING"` and ≥2 non-out → `START_HAND`, else no hand start → **waits until next hand** (`PlayerLifecycleService.addPlayer`). |
| **Consented leave** | Any | **Force fold** → then `removePlayer` with cash-out; if was toAct, turn advances in `executeForcedFold` (`Dealer.handleConsentedLeave` → `forceFoldForLeave` → `removePlayer`). |
| **Remove (bot / TTL / etc.)** | Any | No force fold; remove from state; **`ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL`** fixes toAct/street (`removePlayer`/`removeBot` → `ensureHandAdvancingAfterPlayerRemoval`). |
| **Disconnect** | No | `markDisconnected`; no status change; next time it’s their turn, **maybeActForBot** will enqueue check/fold. |
| **Disconnect** | Yes | Same; **MAYBE_AUTOMATE_TURN** runs immediately and enqueues check/fold; can be skipped if they reconnect before action runs. |
| **Reconnect** | Any | `markReconnected`; `ensureToActHasNeedsActionIfNeeded` so if they’re toAct and round open, they have `needsAction`; no abandon. |
| **Timeout (reconnect failed)** | No | Only if **no** persistent seats → **`markAbandoned`**; they become ABANDONED, stay in hand; **MAYBE_AUTOMATE_TURN** for others. |
| **Timeout (reconnect failed)** | Yes | Same; **toActSeat** advanced to next in `markAbandoned`, then **MAYBE_AUTOMATE_TURN**. |
| **Kick (admin)** | Any | **`markAbandoned`** (same as timeout). |
| **Auto-action cap reached** | — | At hand end, player marked **ABANDONED**; next hand they’re not ACTIVE so not dealt in until they reconnect (and we don’t remove them here). |

---

## 6. Hardening ideas

- **Reconnect window / deadline**  
  - Today the “timeout” is Colyseus `allowReconnection(60)`; `disconnectDeadlineTs` is set but not read by the engine.  
  - **Harden**: Optionally, a timer or periodic check that compares `Date.now()` to `disconnectDeadlineTs` and calls `markAbandoned(userId)` if past, so behavior is consistent even if room lifecycle diverges (e.g. custom transport).

- **Persistent seats + timeout**  
  - When persistent seats are **on**, we never call `markAbandoned` on reconnect failure; the player stays in state with `connected = false` and keeps getting auto-fold when toAct.  
  - **Harden**: Document clearly; consider either calling `markAbandoned` after a longer server-side deadline, or a separate “sitting out after N minutes disconnected” policy that sets ABANDONED or removes, so tables don’t accumulate ghost players.

- **Removal without consent during their turn**  
  - `removePlayer`/`removeBot` do not force-fold; we rely on `ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL` to fix toAct. If the removed player was toAct, we advance to the next seat; the removed player’s chips stay in the pot (they’re no longer in state).  
  - **Harden**: If product wants “leave = fold” even for TTL/kick, we could call a forced-fold before remove when the player is still ACTIVE and in the hand (similar to consented leave but without cash-out semantics).

- **toAct / needsAction after lifecycle**  
  - We already call `ensureToActHasNeedsActionIfNeeded` after add/restore/addBot and in `markReconnected` so the player at toActSeat always has `needsAction` when the round is open.  
  - **Harden**: After any other lifecycle that might change who is at toActSeat (e.g. future “sit out” or “return to seat”), call the same sync so the invariant always holds.

- **Explicit “next hand” rule**  
  - Today “new players wait until next hand” is implicit (no START_HAND when joining mid-hand).  
  - **Harden**: Optional explicit flag (e.g. `sittingOutUntilNextHand`) set on join when `street !== "WAITING"`, cleared when a new hand starts; UI and tests can rely on it; hand-start logic could exclude such players from `activePlayers` as an extra guard.

- **Auto-action cap**  
  - Cap is configurable via `AUTO_ACTION_HAND_CAP`; applied at hand end.  
  - **Harden**: Log and/or metric when cap is reached; consider configurable “warn after N hands” before marking ABANDONED.

---

## 7. Key file reference

| Topic | File(s) |
|-------|---------|
| Join | `src/rooms/PokerRoom.ts` (join handler), `src/engine/dealer/services/PlayerLifecycleService.ts` (`addPlayer`), `src/engine/dealer/utils/TableNavigator.ts` (`findOpenSeat`) |
| Hand start / who is dealt in | `src/engine/dealer/services/HandLifecycleService.ts` (hand start: `activePlayers`, SB/BB, `toActSeat`) |
| Consented leave | `src/rooms/PokerRoom.ts` (`onLeave`), `src/engine/Dealer.ts` (`handleConsentedLeave`, `forceFoldForLeave`), `src/engine/dealer/services/ActionService.ts` (`executeForcedFold`) |
| Remove player/bot | `src/engine/dealer/services/PlayerLifecycleService.ts` (`removePlayer`, `removeBot`), `src/engine/Dealer.ts` (`ensureHandAdvancingAfterPlayerRemoval`) |
| Disconnect / reconnect / timeout | `src/rooms/PokerRoom.ts` (`onLeave`, `allowReconnection`, catch → `markAbandoned`), `src/engine/dealer/services/PlayerLifecycleService.ts` (`markDisconnected`, `markReconnected`, `markAbandoned`) |
| Turn automation (disconnected / bot) | `src/engine/dealer/services/TurnAutomationService.ts` (`maybeActForBot`, `applyDisconnectedAutoActionCapForHand`), `src/engine/Dealer.ts` (`enqueueInternalAction`) |
| toAct invariant | `src/engine/dealer/services/PlayerLifecycleService.ts` (`ensureToActHasNeedsActionIfNeeded`), `src/engine/invariants/assertState.ts` |
| Config | `src/config/seats.ts` (`getAutoActionHandCap`, seat retention), `PokerRoom` (60s reconnect window) |
