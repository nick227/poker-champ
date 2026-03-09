# Root Cause Analysis: Intermittent Game Hang Between Actions

**Date:** 2026-03-09  
**Reported by:** User  
**Severity:** High — intermittent but frequent, directly affects player experience  
**Environment:** Production / Local dev  
**Version:** `hand_x2boBeyDOW`, table `table_-83-QNyWJm`, room `3MBti5CUm`

---

## Summary of Observed Symptoms

### Client console (abridged)
```
[TABLE_RT] INBOUND  TABLE_SNAPSHOT  reason: BOT_ACTION     snapshotSeq: 53  (act_hand_x2boBeyDOW_1)
[TABLE_RT] Action completed: act_hand_x2boBeyDOW_1
[TABLE_RT] INBOUND  TABLE_SNAPSHOT  reason: BOT_ACTION     snapshotSeq: 54  (act_hand_x2boBeyDOW_2)
[TABLE_RT] Action completed: act_hand_x2boBeyDOW_2
[TABLE_RT] INBOUND  TABLE_SNAPSHOT  reason: AUTO_TRANSITION snapshotSeq: 55  street: FLOP  actionId: undefined
— game halts here —
```

### Server logs (abridged)
```json
ACTION_ACCEPTED   hand_x2boBeyDOW  CALL  (user 1c916fba)
POKER_ACTION_ACCEPTED  CALL
TABLE_STALLED  table_-83-QNyWJm  street:FLOP  snapshotSeq:55  lastSnapshotAt:1773042740641
TABLE_STALLED  [repeated every 10s] ...
```

Additional rooms also emit `TABLE_STALLED` repeatedly at the same time (`table__q0F8M9tvJ`, `table__gK_ZDvaCI`).

---

## Issue #1 — Primary: Post-Street-Transition Hang After `AUTO_TRANSITION` Snapshot

### Root Cause

The hang occurs at the `FLOP` street boundary. The sequence is:

1. Two bot actions fire on `PREFLOP` (snapshotSeq 53 & 54).  
2. The last bot action completes and `applyActionResult` determines the betting round is closed.  
3. `advanceStreetOrShowdown()` is called (still inside the serialized action queue), which transitions to `FLOP` and schedules `scheduleNextHand`-equivalent work — but specifically *emits* an `AUTO_TRANSITION` snapshot (snapshotSeq 55) to all clients.  
4. **The stall begins here.** The `FLOP` snapshot arrives on the client with `actionId: undefined` (expected — streets have no actionId). The client renders the flop board — but then never receives the next `BOT_ACTION` snapshot for the first actor on the flop.

The most likely cause of the deadlock is that, after the `AUTO_TRANSITION` emit, the code is expected to call `maybeActForBot()` or `triggerBotAction()` to drive the next actor. If that call is **silently swallowed, throws and is caught internally, or is skipped due to a stale turn-token discarding the enqueued auto-action**, the queue stalls with nobody driving the hand forward.

#### How the discard path works (from `TurnManager` / `AutoActionDispatcher`)

```ts
// AutoActionDispatcher.enqueueInternalAction  (TurnManager.ts:192-213)
const turnToken = TurnTokenUtil.capture(this.deps.state, userId);
// ... (queued with delay) ...
const staleReason = TurnTokenUtil.staleReason(this.deps.state, token);
if (staleReason) {
  this.deps.onAutoActionDiscarded?.();
  return;   // <-- action silently dropped
}
```

When a bot action was enqueued **during PREFLOP** and by the time it runs the queue has already transitioned to FLOP, `staleReason` returns `STREET_CHANGED`. The discard callback `onAutoActionDiscarded` calls `maybeActForBot()` — but if `maybeActForBot()` is itself called while the street transition hasn't fully committed the new `toActSeat` information, it may compute no eligible actor and return without scheduling a new action. This creates a state where:

- Street = `FLOP`
- `toActSeat` not yet visible to the next bot schedule
- Queue is idle
- No timer is pending
- `TABLE_STALLED` fires 10 s / 15 s later

#### Supporting evidence
- `lastSnapshotAt: 1773042740641` aligns exactly with the `AUTO_TRANSITION` (snapshotSeq 55) timestamp. No further snapshots arrive after this point.
- The stall monitor fires 21 seconds later (`1773042761886 - 1773042740641 ≈ 21s`), consistent with the 15 s threshold firing inside a 10 s interval.
- There is no `ACTION_ACCEPTED` log after the `CALL` from user `1c916fba`, confirming the queue is idle.

### Blast Radius
Every hand that transitions from `PREFLOP` to `FLOP` while a bot's queued auto-action is mid-flight is vulnerable. Since bots act with a random delay (`BOT_ACTION_DELAY_MIN_MS`..`BOT_ACTION_DELAY_MAX_MS`), this is a timing race, explaining intermittency.

### Recommended Fix

After `advanceStreetOrShowdown()` emits the `AUTO_TRANSITION` snapshot, **unconditionally re-drive automation for the new street's first actor**, rather than relying solely on the `onAutoActionDiscarded` callback:

```ts
// In LifecycleExecutor or HandOrchestrator, after emitting AUTO_TRANSITION:
await sendTableSnapshotToAll("AUTO_TRANSITION");
// Re-drive bot/automation for the new street unconditionally:
this.deps.maybeActForBot();
```

Additionally, add a **recovery loop** in the stall monitor: if `TABLE_STALLED` fires and `street !== WAITING`, attempt to re-drive `maybeActForBot()` as a self-healing remediation.

---

## Issue #2 — Secondary: Ghost Tables Run Indefinitely Without Any Players

### Root Cause

The server logs show two additional rooms emitting continuous `TABLE_STALLED` warnings, and they have been stalled for **much longer**:

```json
TABLE_STALLED  table__q0F8M9tvJ  lastSnapshotAt:1773041194358   snapshotSeq:19
TABLE_STALLED  table__gK_ZDvaCI  lastSnapshotAt:1773042636076   snapshotSeq:38
```

- `table__q0F8M9tvJ`: last snapshot ~25 minutes before the sample window (delta ≈ 1,548 s).
- `table__gK_ZDvaCI`: last snapshot ~1.6 minutes before (delta ≈ 106 s).

The user notes **only one room has a human player** — the other two are running entirely on bots or are completely empty.

The stall monitor in `startStallMonitorInternal()` correctly gates on `connectedHumanCount === 0` — when it is zero, it returns early and does **not** emit `TABLE_STALLED`. If these tables are emitting `TABLE_STALLED`, it means they each had at least one connected human at some earlier point and are now stuck in a partially-started state.

The root cause here is that the player navigated away (or the lobby created multiple rooms on their behalf) without properly triggering `onLeave → handleConsentedLeave`. Because `autoDispose = false`, the rooms stay alive indefinitely. If the hand was in a non-WAITING street when the human disconnected, the bot automation (which also depends on `maybeActForBot`) is subject to the same discarding race as Issue #1. Rooms that reach the hang state and have no human to trigger a reconnect will simply stall forever.

### Supporting evidence
- `autoDispose = false` is intentional for reconnect support but means rooms are never garbage-collected if they stall.
- The `IDLE_DISPOSE_MS` (default 30 min) only runs when `emptySinceTs` is set, which requires all clients to disconnect cleanly. A bot-only stalled room never becomes "empty" from the room's perspective because bots are virtual — they have no WebSocket clients.

### Recommended Fixes

1. **Purge bot-only rooms triggered by `IDLE_DISPOSE_MS`:** If `connectedHumanCount === 0` for longer than `IDLE_DISPOSE_MS`, actively dispose the room regardless of whether bots are present.

2. **Limit the number of active tables a single user can own simultaneously.** If the user launched 3 tables, 2 of them became ghost games. Consider enforcing a `MAX_TABLES_PER_USER = 1` policy at table creation.

3. **Stall-recovery in stall monitor:** For rooms stuck in a non-WAITING street, call `maybeActForBot()` — or, if the round truly has no eligible actor, force-conclude the hand via `finishHandByLastStanding()`.

---

## Issue #3 — Tertiary: `TABLE_STALLED` Fires on Rooms with Zero Connected Humans

### Root Cause

Looking at the `startStallMonitorInternal` check:

```ts
// PokerRoom.ts:464-466
const connectedHumanCount = this.computeConnectedHumanCount();
if (connectedHumanCount === 0) return;
```

This guard correctly suppresses warnings when there are no live human connections. **However**, the warning fires for `table__q0F8M9tvJ` and `table__gK_ZDvaCI` — implying `connectedHumanCount > 0` **at the time the monitor checks**, even though the user says no human is there.

The likely cause: the player opened multiple game tabs or the lobby UI created multiple room joins for the same user. The old sessions are still counted as "connected" by Colyseus until WebSocket-level close is confirmed. This means:

- A disconnected-but-not-yet-torn-down session is counted as `connectedHumanCount = 1`.
- The stall monitor correctly fires warnings.
- But there's no real player to act, so the hand is permanently suspended.

### Contributing Code Path

`computeConnectedHumanCount()` (in `PokerRoom.ts`) iterates over the state's players and counts those with `kind === "HUMAN"` and `connected === true`. The `connected` flag is set to `false` by `markDisconnected()`, which is called in `onLeave`. If `onLeave` hasn't fired yet (e.g., abrupt TCP drop without clean WebSocket close), the flag remains `true` for the duration of the reconnect grace window (`RECONNECT_TIMEOUT_MS = 20 min`).

This means a zombie session can hold the stall monitor alert open for up to **20 minutes per table**.

### Recommended Fixes

1. **Add a `TABLE_STALLED` cooldown/deduplication log.** Currently it logs every 10 s indefinitely. Limit to 3 consecutive emissions then suppress until state changes.

2. **Include `connectedHumanCount` in `TABLE_STALLED` log payload** to distinguish "stalled with real players" from "stalled with ghost sessions" at a glance.

3. **Shorten the reconnect window for mobile/browser clients** where abrupt disconnects are common, or use heartbeat pings to eagerly flip `connected = false`.

---

## Priority Matrix

| # | Issue | Severity | Likely Frequency | Effort |
|---|-------|----------|-----------------|--------|
| 1 | Post-street-transition bot action discard → hand hangs | **High** | Frequent (race condition on every street advance with bots) | Medium |
| 2 | Ghost rooms run indefinitely; multiple tables per user | **Medium** | Always present when user opens multiple lobby games | Low |
| 3 | Zombie sessions inflate `connectedHumanCount`, mask stall root | **Low** | Common on abrupt disconnects | Low |

---

## Immediate Mitigation (Before Fixes Ship)

1. Add a **stall-recovery action** inside `startStallMonitorInternal`: if stalled **and** `street !== WAITING` **and** `connectedHumanCount > 0`, call `maybeActForBot()` from the stall monitor timer itself. This is a safe fallback — `maybeActForBot` is idempotent.

2. Add a **server-side admin endpoint** to force-advance a stalled hand (e.g., `POST /admin/tables/:tableId/recover`) so support can unblock players without a restart.

3. **Rate-limit or block table creation** when a user already has an active live table session to prevent ghost proliferation.

---

*Analysis based on codebase review of `PokerRoom.ts`, `Dealer.ts`, `TurnManager.ts`, `HandOrchestrator.ts`, `PokerRoomStallMonitor.ts`, and provided log samples.*

---

## Resolution — Fixes Applied (2026-03-09)

### Fix 1 — Action Queue Recovery + Re-drive After Discard (Issue #1)

**Files:** `src/engine/dealer/services/TurnManager.ts`, `src/engine/Dealer.ts`

#### Problem (confirmed)
`enqueueInternalWork` (used for all bot auto-actions) had no error recovery. When queued work threw — due to an action rejection, or a discarded stale turn token passing through to the catch path — the queue's `Promise` chain stayed in a rejected state. All subsequent work chained with `.then()` silently never ran, freezing the table.

#### Changes
1. **Queue recovery in `TurnManager`** — `enqueueInternalWork` now uses the same `.catch(...).then(...)` guard already applied to `enqueueSerializedStateMutation` and `enqueuePlayerAction`. A failure in internal work is logged and the queue continues rather than staying rejected.

2. **Re-drive after discard/failure** — When a queued auto-action is discarded (stale turn token, ineligible actor, or player reconnected) or fails, the `onAutoActionDiscarded` callback now immediately calls `maybeActForBot()`. This ensures the table advances to the next actor (bot or human) rather than going idle.

#### Diagnostic logs added
| Log key | When |
|---|---|
| `INTERNAL_WORK_FAILED` | Internal work threw; queue will continue |
| `INTERNAL_WORK_RECOVERED_QUEUE_CONTINUES` | Queue successfully recovered after failure |
| `AUTO_ACTION_DISCARDED` / `AUTO_ACTION_FAILED` | Auto-action dropped, followed by… |
| `AUTO_ACTION_REDRIVE_TRIGGERED` | `maybeActForBot()` called as re-drive |
| `BOT_ACTION_SCHEDULED` / `MAYBE_ACT_FOR_BOT_RESULT` | Bot scheduling visibility |
| `ACTION_RESOLVED_NEXT_ACTOR` | Emitted in `applyActionResult` after every branch (NO_OP, WAITING_FOR_PLAYERS, HAND_FINISHED, STREET_COMPLETE, TURN_ADVANCED); includes `nextSeat: state.toActSeat` |
| `STREET_ADVANCE_COMPLETED` | Street transition finished, next actor selected |
| `NEXT_ACTOR_SELECTED` | Next actor seat chosen after street advance |

> [!TIP]
> These logs can be gated behind `POKER_STALL_DEBUG=1` once the freeze path is confirmed in production. Remove or flag them after the hang is no longer reproducible.

---

### Fix 2 — Ghost Table Stall Suppression (Issue #2 + #3)

**File:** `src/rooms/PokerRoom.ts` (`startStallMonitorInternal`)

#### Problem (confirmed)
The stall monitor ran every 10 s for every room regardless of whether any human was connected. Tables the user created but never joined (or navigated away from) produced continuous `TABLE_STALLED`, `TURN_STALLED`, and `QUEUE_DEPTH_HIGH` log traffic with no player to act on it.

#### Change
At the top of each stall-check interval, `connectedHumanCount` is now computed first. If it is `0`, the interval returns immediately and skips all three checks. Rooms with no connected humans produce zero stall log traffic.

#### Diagnostic improvement — `TABLE_STALLED` payload extended
When `TABLE_STALLED` does fire (at least one connected human present), the log payload now includes two new fields:

| Field | Purpose |
|---|---|
| `toActSeat` | Shows whether the engine has a next actor selected |
| `queueDepth` | Shows whether the queue is stuck (depth > 0) or idle (depth = 0) |

Existing fields retained: `roomId`, `tableId`, `handId`, `street`, `snapshotSeq`, `lastSnapshotAt`.

---

### Open Items (Not Yet Fixed)

| # | Item | Notes |
|---|---|---|
| 2a | Idle dispose for bot-only rooms | Rooms with `connectedHumanCount === 0` for > `IDLE_DISPOSE_MS` should auto-dispose even when bots are present |
| 2b | `MAX_TABLES_PER_USER` enforcement | Prevent multiple live tables from the same user in the lobby |
| 3 | Shorten reconnect grace for browser clients | 20-min window keeps zombie sessions counted as "connected" for too long |
| — | Admin recovery endpoint | `POST /admin/tables/:tableId/recover` to unblock a stalled hand without a restart |

*Resolution recorded by Antigravity based on developer summary 2026-03-09.*
