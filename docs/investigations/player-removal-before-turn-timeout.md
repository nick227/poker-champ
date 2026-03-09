# Player removal before TURN_TIMEOUT_TOTAL_MS – investigation

**Focus:** Why players might be removed (sit-out / ABANDONED) before the 20‑minute turn timeout.

**TURN_TIMEOUT_TOTAL_MS** = 20 min (see `src/engine/dealer/timing.ts`). The human turn timeout schedules `setPlayerSittingOut(userId, true)` after this duration when it’s their turn and they don’t act.

---

## 1. Disconnect timers

**Flow:** On leave (non-consented), `PokerRoomLeaveService` sets `deadlineTs = Date.now() + room.reconnectTimeoutMs` and calls `markDisconnected(userId, deadlineTs)`. `PlayerLifecycleService.markDisconnected` sets `player.disconnectDeadlineTs = disconnectDeadlineTs`. **DisconnectManager** runs a sweep every 10s; when `now > player.disconnectDeadlineTs` it calls `markAbandoned(userId)`.

**Reconnect timeout:** `resolveReconnectTimeoutMs()` enforces a **minimum of 20 min** (`MIN_RECONNECT_TIMEOUT_MS`). So under normal config, the disconnect sweep does **not** abandon players before 20 min.

**Exception – restored players:** When a player is **restored from session** with `connected: false` (e.g. server restart, room boot from persisted seats), the code previously set `player.disconnectDeadlineTs = 0`. So they had **no** grace window. The disconnect sweep never abandons them based on time (deadline 0 is never in the past in a way that triggers abandon), but the **auto-action cap** (see below) treats `disconnectDeadlineTs === 0` as “outside grace” and counts auto-actions immediately, leading to ABANDONED after 3 hands. **Fix:** When restoring with `connected: false`, pass `reconnectTimeoutMs` and set `player.disconnectDeadlineTs = Date.now() + reconnectTimeoutMs` so they get the same grace as a freshly disconnected client.

---

## 2. Auto sit-out (AUTO_ACTION_HAND_CAP)

**Flow:** `TurnAutomationService.applyDisconnectedAutoActionCapForHand()` is called at hand-end boundaries (last standing, showdown). For each **human** who is disconnected and had an auto-action this hand, it either:

- Skips (does not count) if the player is **inside** the reconnect grace:  
  `player.disconnectDeadlineTs > 0 && nowTs <= player.disconnectDeadlineTs`
- Otherwise increments a per-user counter and, when it reaches `getAutoActionHandCap()` (default 3), sets `player.status = "ABANDONED"` and calls `onAutoSitOutReachedCap`.

So under normal disconnect flow, the cap only applies **after** the 20 min grace (same as disconnect sweep). So removal by cap happens at or after 20 min.

**Exception – restored players:** Restored with `connected: false` and `disconnectDeadlineTs = 0` were treated as “outside grace,” so every hand in which they auto-acted was counted. After 3 such hands they were marked ABANDONED, which can be well before 20 min. The restore fix above aligns their grace with the turn timeout.

---

## 3. Seat lifecycle (sitting out, leave, sweep)

**Explicit sit-out:** Client sends sit-out; `Dealer.setPlayerSittingOut(userId, true)` sets `sittingOutUntilNextHand = true` and `status = "ABANDONED"` (if not OUT). This is user-driven, not a timeout.

**Consented leave:** `handleConsentedLeave` removes the player; not related to turn timeout.

**runSittingOutSweep (PokerRoom):** Runs only when `connectedHumanCount === 0`. It **purges** seats for players who are **already** ABANDONED and whose persisted disconnect time is older than `abandonedPurgeMs` (default 30 min). It does **not** set ABANDONED; it removes players who were already abandoned (e.g. by disconnect sweep or cap). So it does not cause removal before 20 min.

**Turn timeout (TurnManager.TurnTimeoutScheduler):** Schedules a single timeout per turn with `setTimeout(..., TURN_TIMEOUT_TOTAL_MS)`. When it fires, it enqueues work that calls `setPlayerSittingOutInternal(userId, true)`. So this is the only path that intentionally sits out a player **at** 20 min for not acting.

---

## Summary

| Path                         | Can remove before 20 min? | Notes |
|-----------------------------|---------------------------|--------|
| Disconnect sweep            | No (with min 20 min recon) | Reconnect timeout has a 20 min minimum. |
| Auto-action cap             | Yes (bug, now fixed)      | Restored disconnected players had `disconnectDeadlineTs = 0` and were capped after 3 hands. |
| runSittingOutSweep          | No                        | Only purges already-ABANDONED after 30 min. |
| Turn timeout                | No                        | Fires at 20 min. |
| Explicit sit-out / leave    | N/A                       | User-initiated. |

**Code changes:**
1. When restoring a player with `connected: false`, the room passes `reconnectTimeoutMs: this.RECONNECT_TIMEOUT_MS` and the lifecycle service sets a future `player.disconnectDeadlineTs`.
2. **Defensive default:** In `PlayerLifecycleService.restorePlayerFromSession`, when `connected === false` we always set `disconnectDeadlineTs = Date.now() + (reconnectTimeoutMs > 0 ? reconnectTimeoutMs : RECONNECT_GRACE_DEFAULT_MS)`. So even if a caller omits `reconnectTimeoutMs`, we never create a disconnected human with deadline 0. (`RECONNECT_GRACE_DEFAULT_MS` = 20 min, in `src/engine/dealer/timing.ts`.)

---

## Potential problem vectors (audit)

All production code paths that set `disconnectDeadlineTs` or create a disconnected human were audited so no path can leave “disconnected human with deadline 0” except by design (e.g. already abandoned / consented leave).

| Location | What it does | Risk / mitigation |
|----------|----------------|-------------------|
| **PlayerLifecycleService.addPlayer** | New player: `connected = true`, `disconnectDeadlineTs = 0` | OK – they are connected. |
| **PlayerLifecycleService.restorePlayerFromSession** | Restore: when `connected === false` we set a future deadline (param or `RECONNECT_GRACE_DEFAULT_MS`). | Fixed + defensive default. |
| **PlayerLifecycleService.markDisconnected** | Sets `disconnectDeadlineTs = disconnectDeadlineTs` (from room). | OK – room uses `Date.now() + RECONNECT_TIMEOUT_MS` (min 20 min). |
| **PlayerLifecycleService.markReconnected** | Sets `disconnectDeadlineTs = 0`. | OK – they are connected. |
| **PlayerLifecycleService.markAbandoned** | Sets `connected = false`; may clear deadline. | OK – they are being abandoned; no extra grace needed. |
| **PlayerLifecycleService.deferRemovalDuringActiveHand** | Sets `connected = false`; clears deadline unless reason is DISCONNECT_TIMEOUT and still in grace. | OK – intentional for LEAVE / BOT_AUTO_REMOVE. |
| **Dealer.setPlayerSittingOutInternal(true)** | When `player.connected` we set `disconnectDeadlineTs = 0`. | OK – they are connected and choosing to sit out. |
| **Dealer.setPlayerSittingOutInternal(false)** | Clears `disconnectDeadlineTs = 0`. | OK – rejoin path. |
| **DisconnectManager.sweepDisconnectDeadlines** | Abandons when `now > player.disconnectDeadlineTs`. Skips when `disconnectDeadlineTs <= 0`. | OK – 0 means “do not abandon by time”. |
| **TurnAutomationService.applyDisconnectedAutoActionCapForHand** | Skips counting when `disconnectDeadlineTs > 0 && nowTs <= deadline`. | OK – with defensive default, restored disconnected players always have a future deadline. |
| **SnapshotService** | Invariant: if `connected === true` then `disconnectDeadlineTs` must be 0. | OK – all paths that set `connected = true` clear deadline. |
| **Dealer.releasePendingSeats** | Logs `DISCONNECTED_PLAYER_WITHOUT_RECONNECT_DEADLINE` when disconnected and deadline 0; does not release until deadline past or 0. | OK – diagnostic; with default, we no longer create that state for restored players. |

**Callers of `restorePlayerFromSession`:**
- **PokerRoom** (boot from persisted seats): passes `reconnectTimeoutMs` → explicit grace.
- **PokerRoomJoinService** (join rebound): calls restore without `connected: false` then immediately marks reconnected → no disconnected state.

**Conclusion:** The only prior bug was restore with `connected: false` and no deadline. That is fixed and guarded by the defensive default so any future caller that restores a disconnected human without passing `reconnectTimeoutMs` still gets 20 min grace.
