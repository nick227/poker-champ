# Gameplay System Design

**Last updated:** 2026-03-15
**Status:** Living document — reflects current implementation with improvement proposals

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Snapshot Pipeline (Server)](#2-snapshot-pipeline-server)
3. [Real-Time Event Processing (Client)](#3-real-time-event-processing-client)
4. [Timeout & Stall Mechanisms](#4-timeout--stall-mechanisms)
5. [Known Issue: Post-Street-Transition Hang](#5-known-issue-post-street-transition-hang)
6. [Over-Engineering & Complexity Hotspots](#6-over-engineering--complexity-hotspots)
7. [Proposals & Improvements](#7-proposals--improvements)

---

## 1. Architecture Overview

The game is **server-authoritative**. The server owns all game state and sends read-only snapshots to clients. Clients submit action intents; the server validates, applies, and broadcasts the result.

### Server Layers

```
PokerRoom (Colyseus Room — transport, lifecycle, rate limiting)
  └─ Dealer (engine coordinator — serializes all mutations)
       ├─ ActionService        — validates and applies player actions
       ├─ TurnManager          — queues actions, schedules timeouts
       ├─ TurnAutomationService — bot actions, disconnected-player auto-actions
       ├─ SnapshotService      — builds and broadcasts TABLE_SNAPSHOT messages
       ├─ HandLifecycleService — hand start/end/settlement orchestration
       └─ SettlementService    — pot distribution at showdown
```

### Client Layers

```
useTableRealtime          — WebSocket channel per table, dispatches inbound messages
  └─ table.store (Zustand) — stores snapshots keyed by tableId, sequence-gated
       └─ multitable.store  — multi-table orchestration, pending action lifecycle
            └─ useTablePageController — 50+ memoized values, animation, actions
                 └─ useTableSceneModel — render-ready model derived from snapshot
                      └─ ActionBar / BoardArea / Seats — UI components
```

### Communication Contract

All server→client payloads are `TABLE_SNAPSHOT` messages. There is no fine-grained event stream — every state change results in a full snapshot broadcast. This keeps the client stateless (it never accumulates deltas) at the cost of larger payloads per action.

Client→server messages: `ACTION`, `JOIN`, `REJOIN`, `SIT_OUT`, `CHAT`, `ADD_BOT`, `REMOVE_BOT`.

---

## 2. Snapshot Pipeline (Server)

### 2.1 Creation Path

```
Player action arrives at PokerRoom.onMessage("ACTION")
  → PokerRoom validates rate limit (30 actions/min per client)
  → dealer.handleAction(userId, payload)
    → TurnManager.enqueuePlayerAction(userId, payload)         — serialization gate
      → ActionService.execute(userId, payload)                 — validation + apply
        → applyActionResult(result)                            — routes by result type
          → SnapshotService.emitToAll(reason, snapshotId)      — builds + broadcasts
```

All mutations are serialized through `TurnManager`'s action queue. This prevents race conditions between concurrent client messages and bot actions.

### 2.2 Snapshot Content

Each `TABLE_SNAPSHOT` contains:

| Field | Purpose |
|---|---|
| `snapshotSeq` | Global monotonic sequence number (never resets, used for ordering) |
| `reason` | `ACTION_ACCEPTED` / `AUTO_TRANSITION` / `SEAT_CHANGE` / `HAND_START` / `HAND_END` / `BOT_ACTION` |
| `actionId` | Echoes the client's submitted actionId so the client can clear pending state |
| `street` | `PREFLOP` / `FLOP` / `TURN` / `RIVER` / `SHOWDOWN` / `WAITING` |
| `seats[]` | All seat states: userId, stackCents, cards (hole/community), status, isToAct |
| `potCents` | Total pot |
| `communityCards[]` | Board cards |
| `heroActionOptions` | Legal actions for the connected player (FOLD/CHECK/CALL/BET/RAISE/ALL_IN + wager bounds) |
| `turnDeadlineMs` | Unix timestamp when current player's turn expires (0 if not active) |
| `lastAction` | Most recent completed action (type, userId, amountCents, sequence) |
| `lastHandResult` | Winner info, winning hand, rake — present at hand end |
| `avatarUrls` | Map of userId → URL, fetched per snapshot (see §2.3) |
| `heroCalculations` | Server-computed equity / odds for hero |
| `handId` | Current hand identifier |

### 2.3 Avatar Fetch in Hot Path

`SnapshotService` fetches avatar URLs from the database **on every snapshot emission**. This sits in the critical path between action acceptance and client notification.

**Current mitigation:** 2-second timeout with fallback to `null`. If the DB is slow, the snapshot is delayed up to 2 seconds but not blocked indefinitely.

**Risk:** Under sustained load, avatar fetches add consistent latency to every action round-trip. See [Proposal A](#proposal-a-remove-avatar-fetch-from-snapshot-hot-path).

### 2.4 Snapshot Sequencing

A single global `snapshotSeq` counter is incremented per emission. The client uses this to detect and drop out-of-order packets. Stream restarts are detected by the client when `seq === 1` arrives after a higher value (indicating server reconnect).

### 2.5 Action Deduplication

`Dealer` maintains a per-hand `actionIdFirstClaimByKey` map that prevents the same action from being applied twice (important for retry logic). Keys encode `handId:street:handActionSeq:seat:userId`. This map is never explicitly cleared at hand end — see [Proposal F](#proposal-f-clear-hand-context-deduplication-map-at-hand-end).

---

## 3. Real-Time Event Processing (Client)

### 3.1 Snapshot Reception

```
WebSocket message arrives
  → useTableRealtime.onMessage
    → handleTableRealtimeInboundMessage
      → checks snapshotSeq against lastSeqByTableId
        → if stale: drop silently
        → if seq=1 after higher: reset cursor (stream restart)
        → if valid: table.store.setSnapshot(tableId, snapshot)
          → triggers Zustand subscribers
            → useTablePageController re-derives ~50 memoized values
              → React re-renders affected components
```

### 3.2 Action Submission & Acknowledgment

```
User taps button in ActionBar
  → actionBar.controller.onAction(type, amount)
    → useTablePageController.sendAction
      → multitable.store.dispatchTableAction(tableId, payload)
        → stores PendingAction { actionId, payload, retriesLeft: 3, createdAtTs }
        → realtimeSender("ACTION", payload) — sends over WebSocket
          → server processes
            → server sends TABLE_SNAPSHOT with matching actionId
              → handleTableRealtimeInboundMessage
                → shouldClearPendingActionFromSnapshot() returns true
                  → multitable.store.clearPendingActionIfMatch(tableId, actionId)
```

**While pending:** The ActionBar is disabled. If no ack arrives within **1200ms**, a "Syncing action..." spinner appears in the status strip.

**Retry logic:** On error response (QUEUE_FULL, RATE_LIMITED) or timeout, the action is retried up to 3 times with a jittered 2-second delay (0.5×–1.5× multiplier). After 3 failures the pending action is cleared and the UI unblocks.

**Ack clearing conditions** (any one of these clears pending):
1. `snapshot.actionId === pendingAction.actionId` — explicit acknowledgment
2. No active hand in snapshot — hand ended while action was in flight
3. Hero is no longer `toAct` — server advanced past this player
4. `snapshot.lastAction.seq > pendingAction.seq` — server is ahead

### 3.3 Multitable Store

Supports up to 8 simultaneous tables. Each table has independent:
- `pendingActionByTableId` — one pending action per table at a time
- `tableSenders` — registered WebSocket send function per table
- `tableJoinById` — buy-in state persisted to localStorage (24h TTL)
- `roomIdByTableId` — session IDs for rejoin

### 3.4 Status Strip State Machine

`useLiveTableStatusStripState` drives the `TableStatusStrip` UI through five phases:

| Phase | Duration | Display |
|---|---|---|
| `transport` | Until reconnected | "Reconnecting..." / "Disconnected" |
| `inHand` | While hand active | Hero's turn / opponent's last action / "Showdown" |
| `winnerHold` | 900ms after hand end | Winner name + hand strength |
| `boardReset` | 180ms after winnerHold | Face-down board, zeroed pot |
| `betweenHands` | Until next HAND_START | "Dealing next hand..." |

Action notices (e.g. "Alex raised to $10") have a minimum display time of 400ms with a single queued successor notice.

---

## 4. Timeout & Stall Mechanisms

### 4.1 Turn Timeout (Server)

| Constant | Default | Notes |
|---|---|---|
| `TURN_TIMEOUT_TOTAL_MS` | 20 minutes | Configurable via env var |
| `RECONNECT_GRACE_DEFAULT_MS` | 20 minutes | Must be ≥ turn timeout |

**Flow:**
1. When it becomes a human player's turn, `TurnManager.scheduleHumanTurnTimeout(userId)` fires a `setTimeout` for 20 minutes.
2. Idempotency token: `handId:street:handActionSeq:seat:userId` — duplicate schedules are no-ops.
3. On expiry: player is auto-sat-out (`setPlayerSittingOutInternal`), `turnDeadlineMs` cleared, metric recorded.
4. On street advance, hand finish, or early fire: `clearPendingHumanTurnTimeout()` cancels the timer.

**Memory note:** One 20-minute `setTimeout` is held per active human turn. With many concurrent tables this is acceptable, but a centralized timer wheel would be more efficient at scale.

### 4.2 Reconnect Grace & Auto-Action Cap

When a player disconnects, `disconnectDeadlineTs = now + RECONNECT_TIMEOUT_MS` is stored. While within this window, `TurnAutomationService` fires auto-actions (CHECK if available, else FOLD) on their behalf.

An **auto-action cap** (`getAutoActionHandCap()`) limits how many times per hand a disconnected player can be auto-acted. Once the cap is reached, the player is marked **ABANDONED** and removed from the hand.

On reconnect, the auto-action count for that player resets.

### 4.3 Bot Action Timing

Bots act with a random delay of `BOT_ACTION_DELAY_MIN_MS`–`BOT_ACTION_DELAY_MAX_MS` (default 0–1000ms). The delay is implemented as `enqueueAction(userId, payload, delayMs)` — the action is already decided, just delayed for UX realism.

If a bot's scheduled action fires but its turn token is stale (street or hand has advanced), the action is silently discarded and `onAutoActionDiscarded()` is called.

### 4.4 Stall Detection (Server)

`PokerRoom` runs a `setInterval` (called `stallCheckInterval`) that periodically evaluates `dealer.getStallReasonPublic(now)`. Stall reasons:

| Reason | Cause |
|---|---|
| `BOT_OVERDUE` | Bot's action delay window has elapsed but no action fired |
| `TURN_TIMEOUT_OVERDUE` | Human exceeded timeout + grace period |
| `STREET_ADVANCE_OVERDUE` | Betting closed but street not advanced |
| `SHOWDOWN_OVERDUE` | All-in runout required but not triggered |
| `INVALID_TO_ACT` | `toActSeat` has no valid player |

If a stall is detected and it is more than **5 seconds** old, the room triggers a redrive (`requestDrive()`). Stalls are rate-limited to log once per 10 seconds.

### 4.5 Defensive Redrive System

`requestDrive(reason)` is the engine's self-healing mechanism — it re-evaluates `computeNextStep()` and triggers the appropriate follow-up action (start hand, advance street, run showdown, act for bot). It is called:

- After every action result in `applyActionResult()`
- From the stall check interval
- From `PokerRoom` lifecycle events (player join/leave)

There are approximately **100+ `requestDrive` calls** across the codebase. The intention is that even if one drive path fails silently, another will eventually trigger the correct next step. This is effective for resilience but makes the control flow hard to trace.

---

## 5. Known Issue: Post-Street-Transition Hang

> See also: `docs/rca-game-hang-2026-03-09.md`

### Symptom

The game stalls after a street transition (`AUTO_TRANSITION` snapshot). The client receives the new board state but the first actor on the new street never receives their bot action or turn prompt.

### Root Cause

After `AUTO_TRANSITION` is emitted, `maybeActForBot()` or `requestDrive("MAYBE_ACT_FOR_BOT")` is expected to drive the next actor. If the scheduled bot action carries a **stale turn token** from the previous street, `TurnTokenUtil.staleReason()` returns non-null and the action is silently discarded via `onAutoActionDiscarded()`. If no secondary drive path reschedules the action, the hand stalls.

The silent discard path in `TurnManager`:

```ts
// TurnManager.ts ~line 200
const staleReason = TurnTokenUtil.staleReason(this.deps.state, token);
if (staleReason) {
  this.deps.onAutoActionDiscarded?.();
  return;  // action dropped, nothing re-triggers
}
```

### Why the Stall Persists

The stall check interval does eventually detect `BOT_OVERDUE` and calls `requestDrive()`. However, there is a window (up to the interval period) where the game is frozen and the player sees no activity.

### Mitigation in Place

The stall check interval's redrive is the current recovery mechanism. It means stalls self-heal within one check interval but the game can freeze for a visible period.

---

## 6. Over-Engineering & Complexity Hotspots

### 6.1 `useTablePageController.tsx` — Monolithic Orchestration Hook

**File:** `apps/client/src/features/table-page/useTablePageController.tsx`
**Size:** ~747 lines with 50+ `useMemo` / `useCallback` declarations

This single hook coordinates: opponent rendering, seat context, action submission, animation requests, chat, rejoin UI, sound effects, avatar URL updates, anchor layout bounds, multi-table tab bar, and top navigation.

**Problems:**
- Any snapshot change invalidates multiple memo chains even for unrelated concerns
- Testing any single concern requires exercising the full hook
- Difficult to identify which memo is the performance bottleneck

### 6.2 `useLiveTableStatusStripState.ts` — 666-Line State Machine

**File:** `apps/client/src/features/table-page/useLiveTableStatusStripState.ts`
**Size:** ~666 lines implementing a 5-phase reducer

The state machine ticks on both snapshot changes and periodic timers, updating an `activeNotice` / `queuedNotice` pair. Every tick triggers a re-render even when the displayed message doesn't change.

### 6.3 Action Options Repair — Three Sequential Derivation Passes

**File:** `apps/client/src/features/table/components/table/model/useTableSceneModel.ts`

On every snapshot, the client runs three separate functions to reconstruct `heroActionOptions`:

1. `mergeCallWithStack` — derives `canCall` and effective callAmount
2. `expandOptionsWithFullLegal` — fills missing boolean flags
3. `fillWagerBoundsFromSnapshot` — derives `minRaiseTo` / `maxRaiseTo`

Each pass re-traverses the same snapshot fields. The purpose is to handle lesson snapshots that may have incomplete `actionOptions` from the server. For live play all three passes are redundant since the server sends complete options.

### 6.4 Multitable Selector — Reads Entire Snapshot Map

**File:** `apps/client/src/features/table/hooks/useTablePageStores.ts` line ~43

```ts
snapshotsByTableId: s.snapshotsByTableId   // selects the whole map
```

Any snapshot update for **any** open table triggers a re-render of the current table's page, even if the current table's snapshot didn't change.

### 6.5 `mapSeatsToOpponents` Recalculated on Every Snapshot

**File:** `apps/client/src/features/table-page/useTablePageController.tsx` line ~216

`mapSeatsToOpponents` sorts all seats, checks showdown card visibility, and builds the opponent array. It runs on every snapshot even when the seat list and hand state are identical. No stable identity is used to skip unchanged inputs.

### 6.6 Unbounded HandContext Deduplication Map

**File:** `apps/server/src/engine/Dealer.ts`

`actionIdFirstClaimByKey` accumulates action deduplication entries throughout a hand's lifetime. It is not cleared at hand end. In an unusually long hand (many orbits, bots, timeouts) this map grows without bound. Typical hands are short enough that this doesn't matter in practice.

### 6.7 Animation Blocks Action Submission

Animations (pot win, all-in celebration) are triggered from `useTablePageController` when `snapshot.lastAction` or `snapshot.lastHandResult` changes. The ActionBar is kept disabled while a `pendingAction` exists — but if an animation triggers a state update that re-creates the pending action object, the disable window extends beyond the actual server round-trip.

---

## 7. Proposals & Improvements

### Proposal A: Remove Avatar Fetch from Snapshot Hot Path

**Problem:** Every snapshot waits up to 2s for a Prisma avatar lookup.
**Fix:** Cache avatar URLs in an in-memory map (`userId → url`) within `SnapshotService` with a short TTL (e.g. 5 minutes). Serve from cache synchronously; refresh in background. On cache miss, send `null` immediately and emit a follow-up snapshot when the URL resolves.
**Impact:** Eliminates up to 2s of action round-trip latency under DB load. Snapshots become fully synchronous to build.

---

### Proposal B: Consolidate Action Options Repair into a Single Pass

**Problem:** Three sequential derivation functions re-traverse the same snapshot data.
**Fix:** Replace `mergeCallWithStack` + `expandOptionsWithFullLegal` + `fillWagerBoundsFromSnapshot` with a single `repairActionOptions(snapshot, heroSeat)` function that makes one pass and returns a fully populated `HeroActionOptions`.
**Impact:** Cleaner code, marginally faster derivation, single place to audit lesson-snapshot repair logic.

---

### Proposal C: Scope Multitable Snapshot Selector

**Problem:** `snapshotsByTableId` is selected wholesale, causing re-renders on unrelated table updates.
**Fix:**
```ts
// Before
snapshotsByTableId: s.snapshotsByTableId

// After
snapshot: s.snapshotsByTableId[tableId] ?? null
```
**Impact:** Eliminates cross-table re-render cascade for multi-table sessions.

---

### Proposal D: Add Client-Side Action Escape Hatch

**Problem:** If the server silently drops an action (e.g. QUEUE_FULL not returned), the client is stuck showing "Syncing action..." indefinitely. The only recovery is page refresh.
**Fix:** After 10 seconds of unacknowledged pending action (post all retries), surface a "Retry" button and automatically clear the pending state if the user's turn has passed based on `snapshot.lastAction.seq`.
**Impact:** Players can self-recover without refreshing. Reduces support tickets for "game stuck" reports.

---

### Proposal E: Memoize `mapSeatsToOpponents` by Snapshot Identity

**Problem:** Opponents are recomputed on every snapshot even when seats are unchanged.
**Fix:** Use the `snapshotSeq` as a cache key. If `snapshotSeq` matches the previous computation, return the memoized opponent array.
**Impact:** Avoids O(seats) sort and card-visibility checks on every snapshot for unchanged seat layouts (e.g. during spectator phases).

---

### Proposal F: Clear Hand Context Deduplication Map at Hand End

**Problem:** `actionIdFirstClaimByKey` in `Dealer` grows unbounded across a hand.
**Fix:** Call `actionIdFirstClaimByKey.clear()` (or swap to a new `Map`) inside the hand-end handler, after settlement is complete and the hand ID has advanced.
**Impact:** Prevents memory creep on long-running tables. Safe because actions from the previous hand will never be replayed after hand end.

---

### Proposal G: Fix the Post-Street-Transition Stall Race

**Problem:** When a bot's turn token is stale after a street transition, the action is silently discarded with no re-trigger. The stall check interval recovers this, but with a visible freeze.
**Fix:** In `onAutoActionDiscarded`, if the hand is still active and the discarded action was for the `toActSeat`, immediately call `requestDrive("BOT_ACTION_DISCARDED_RETRY")`. This closes the window between discard and the next stall check tick.

```ts
// TurnAutomationService or TurnManager
onAutoActionDiscarded: () => {
  if (this.deps.state.hand?.status === "ACTIVE") {
    this.deps.requestDrive("BOT_ACTION_DISCARDED_RETRY");
  }
}
```

**Impact:** Eliminates the post-street hang (described in §5). Zero performance cost — only fires when a stale-discard actually happens.

---

### Proposal H: Split `useTablePageController` into Focused Sub-Hooks

**Problem:** 747-line monolithic hook with 50+ memos couples unrelated concerns.
**Proposed split:**

| Sub-hook | Responsibility |
|---|---|
| `useTableActionController` | Action submission, pending state, sound effects |
| `useTableAnimationController` | Animation requests, pot win detection |
| `useTableLayoutController` | Anchor bounds, seat layout, opponent mapping |
| `useTableNavController` | Top bar, multi-table tab row, rejoin UI |
| `useTableChatController` | Chat messages, voice state |

`useTablePageController` becomes a thin composer of the above.
**Impact:** Testability, isolated re-render scopes, easier profiling.

---

### Proposal I: Batch Rapid Snapshots on Client

**Problem:** Multiple snapshots arriving within one animation frame (e.g. during bot-heavy hands) each trigger a full React re-render cascade.
**Fix:** In `handleTableRealtimeInboundMessage`, buffer incoming snapshots with `requestAnimationFrame`. Within one frame, apply only the highest-sequence snapshot. Intermediate snapshots are dropped from state updates (but their `actionId` acknowledgment is still processed for pending action clearing).
**Impact:** Smoother rendering during fast bot games. Reduces main-thread pressure by up to N-1 renders per frame burst.

---

## Summary: Risk Matrix

| Issue | Severity | Frequency | Fix Complexity |
|---|---|---|---|
| Post-street-transition hang (§5) | High | Intermittent | Low (Proposal G) |
| Avatar fetch latency (§2.3) | Medium | Every action | Medium (Proposal A) |
| Client action stuck with no escape (§3.2) | Medium | Rare | Low (Proposal D) |
| Cross-table re-render on snapshot (§6.4) | Low | Every action | Low (Proposal C) |
| Monolithic controller hook (§6.1) | Low | — | High (Proposal H) |
| Action options 3-pass repair (§6.3) | Low | Every snapshot | Low (Proposal B) |
| Unbounded dedup map (§6.6) | Low | Long hands only | Low (Proposal F) |
| mapSeatsToOpponents re-run (§6.5) | Low | Every snapshot | Low (Proposal E) |
| Snapshot burst re-renders (§3.1) | Low | Bot-heavy games | Medium (Proposal I) |
