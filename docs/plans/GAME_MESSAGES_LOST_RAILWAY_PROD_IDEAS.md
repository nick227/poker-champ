# Game Messages Lost / Game Stalling on Railway Prod vs Localhost — Brainstorm

Possible reasons realtime game messages might be lost or the game might stall on Railway production but not on localhost. Use this as a checklist for investigation and hardening.

**Context:** Colyseus WebSocket transport, single Node API process, split deploy (web static + api-realtime). Client uses `EXPO_PUBLIC_COLYSEUS_URL` (wss) and Colyseus or raw WS transport. See `docs/reference/RAILWAY_DEPLOYMENT.md` and `docs/analysis/WEBSOCKET_REALTIME_ANALYSIS.md`.

---

## Prioritized by likelihood (Colyseus + single Node + Railway)

For **“stale game / action never registered”** in production but not locally, the most likely causes in order:

| Rank | Cause | Section |
|------|--------|---------|
| 1 | Proxy / idle timeout killing WebSocket | § Highest-probability |
| 2 | Event loop blocking on production CPU | § Highest-probability |
| 3 | Room state + reconnection race (sessionId vs userId) | § Highest-probability |
| 4 | Prisma / DB latency blocking action path | § Highest-probability |
| 5–7 | Railway restart, multiple instances, client stuck thinking connected | § Medium-probability |
| — | TLS, packet reorder, Colyseus parsing, CORS, assets | § Low-probability |

**What to suspect first:** event loop blocking **or** proxy idle timeout / dead socket. Those two cause most production realtime stalls in this architecture.

---

## Highest-probability causes

### 1. Proxy / idle timeout killing WebSocket

Railway sits behind a proxy. If the proxy idle timeout is shorter than connection lifetime, the connection can die silently.

**Symptoms:** Client thinks it is still connected; server thinks the client is still connected; messages disappear; game stalls.

**Typical behavior:** `client ----X---- proxy ---- server` (proxy closes idle connection). Server keeps sending to a socket that is already dead upstream.

**Mitigation:**

- Send periodic pings: server → client every 15–25s (e.g. `pingInterval: 15000`).
- Set **`pingMaxRetries: 2`** so if the client doesn’t respond to pings, the server disconnects after ~30–45s — prevents zombie sockets where both sides think they’re connected but no traffic flows.
- Log `ws.on("close")` and `ws.on("error")` if the transport API exposes them.

### 2. Event loop blocking on production CPU

Railway CPU is much slower than a dev machine. If Dealer logic does heavy work (JSON serialization, snapshot building, DB calls, odds calculation, large arrays), the event loop can stall. When it stalls: incoming WS frames wait, outgoing messages wait, timeouts fire, actions appear “lost.” Localhost hides this because CPU is fast.

**Measure it:** Add an event loop delay monitor:

```js
const { monitorEventLoopDelay } = require("perf_hooks");
const h = monitorEventLoopDelay();
h.enable();
setInterval(() => {
  console.log("event loop lag ms", h.mean / 1e6);
}, 5000);
```

If you see >50ms consistently, you have blocking.

### 3. Room state + reconnection race

Colyseus identifies clients by **sessionId**, not **userId**. Failure flow: player’s turn → network blip → browser reconnects → new sessionId → server still waiting on old sessionId → player action ignored → table stalled. Localhost rarely hits this; production does. See **§ Colyseus session replacement** below for the fix.

### 4. Prisma / DB latency blocking action path

If any action path hits DB before state transition (`ACTION → prisma → snapshot → broadcast`), under load the DB can block the game. Railway MySQL latency can be 5–10× localhost. If DB stalls: Dealer waits, snapshot not emitted, clients appear frozen.

**Check:** Action start timestamp vs snapshot emit timestamp.

---

## Medium-probability causes

- **Railway restart / deploy mid-game** — SIGTERM; if WebSockets are not gracefully drained, connections drop, rooms vanish, clients stay stuck. Colyseus rooms are process memory only (no Redis).
- **Multiple instances accidentally running** — If Railway scaled to >1 instance without Redis: client reconnect can land on a different instance, room not found. Verify replicas = 1.
- **Client stuck thinking it is connected** — Browsers sometimes keep a dead socket open (`readyState === OPEN` but no messages). **Mitigation:** Track last message timestamp; if no message for 20s → reconnect.

---

## Low-probability causes (given this stack)

TLS handshake, packet reordering, Colyseus frame parsing, CORS, asset loading — less likely but still worth ruling out if high/medium checks are clean.

---

## Diagnostics to add

### Action lifecycle logging (single biggest diagnostic)

Every action should produce a log chain so that when the game stalls you see where it stopped:

- `ACTION_RECEIVED`
- `ACTION_VALIDATED`
- `ACTION_APPLIED`
- `SNAPSHOT_EMITTED`

Example:

```
[table:123] action received user=42 type=CALL
[table:123] action applied
[table:123] snapshot emitted seq=182
```

**Add latency metadata:** Include **`latencyMs`** (and optionally `tableId`, `handId`, `userId`, `sessionId`) so DB or event-loop delays are visible immediately, e.g.:

- `ACTION_RECEIVED` — tableId, handId, userId, sessionId.
- `ACTION_APPLIED latencyMs=6`
- `SNAPSHOT_EMITTED latencyMs=11`

When rejecting an action, log **ACTION_REJECTED** with **reason** (e.g. `NOT_YOUR_TURN`, `NOT_ELIGIBLE`) so “action never registered” is not a silent return.

### Per-table heartbeat and stall recovery

Track `table.lastActionAt` and `table.lastSnapshotAt`. If a table hasn’t emitted a snapshot for 15s:

1. **Log** `TABLE_STALLED tableId=123`.
2. **Recover** — don’t just log. Otherwise production accumulates dead tables until restart. Call **`dealer.forceProgress()`** (or equivalent) when stalled, e.g.:
   - waiting for player → auto-fold (or advance turn);
   - betting round stuck → advance round;
   - snapshot lost → re-emit snapshot.

Example pattern:

```js
if (Date.now() - table.lastSnapshotAt > 15000) {
  log("TABLE_STALLED", tableId);
  dealer.forceProgress();
}
```

This prevents long-lived dead tables.

### Per-table action queue metric

Log or expose **`dealer.actionQueue` depth** (e.g. queue length or pending count) per table. If this grows over time, the event loop is blocked or actions are backing up — a very useful production signal. The codebase already has `ActionQueue` and `QUEUE_FULL` diagnostics; add a periodic or stall-context log of queue depth (e.g. when logging TABLE_STALLED or every N seconds when depth > 0).

---

## Architectural improvement: authoritative tick loop

**Agree:** Moving to an authoritative tick loop (e.g. tick every 100ms: process queued actions, apply timers, resolve betting, emit snapshot) would avoid many “action lost → game frozen” issues. The server becomes the source of truth; the loop continues even if one action is delayed or lost. This is what most production poker engines do: `tick() → process actions → apply timers → resolve betting → emit snapshot`.

---

## Colyseus session replacement (userId, not sessionId)

This fix prevents most ghost players, stale turns, and stalled tables when a player disconnects/reconnects and the server still thinks the old client owns the turn.

### Core idea

- Track players by **userId** (true identity), not only sessionId.
- When a new client joins with the same userId, **replace** the old session (same player object, new `client` and `sessionId`).
- Never gate “is it this player’s turn?” on sessionId; use userId.
- Bind reconnected client back to the same player in `onLeave` after `allowReconnection`.

### 1. Track players by userId

Player object should include: `userId`, `sessionId`, `client`.

### 2. On join: replace existing player session

In room `onJoin`:

```js
const existing = this.players.find((p) => p.userId === userId);
if (existing) {
  existing.sessionId = client.sessionId;
  existing.client = client;
  // e.g. console.log("SESSION_REPLACED", userId);
  return;
}
```

Reconnecting clients then reclaim their seat.

### 3. Gate actions on userId, not sessionId

- **Bad:** `if (client.sessionId !== currentPlayer.sessionId)`
- **Good:** `if (userId !== currentPlayer.userId)`

Session IDs change on reconnect; user IDs do not.

### 4. Use allowReconnection and rebind client

In `onLeave`:

```js
const player = this.getPlayerBySession(client.sessionId);
if (!player) return;
try {
  const newClient = await this.allowReconnection(client, 60);
  player.client = newClient;
  player.sessionId = newClient.sessionId;
  // e.g. console.log("PLAYER_RECONNECTED", player.userId);
} catch {
  player.disconnected = true;
}
```

### 5. Detect ghost players

In dealer/tick: if `currentPlayer.disconnected` or `Date.now() - player.lastSeenAt > 15000`, auto-fold or treat as abandoned. Prevents table waiting forever on a dead session.

### 6. Client reconnect flow

Client: disconnect detected → connect to room → send userId → server replaces session → snapshot sent. Player resumes where they were.

### Colyseus pitfall: autoDispose with allowReconnection

If you use `allowReconnection()`, ensure **`room.autoDispose = false`**. Otherwise: player disconnects → room empties briefly → room is disposed → reconnect fails → “game vanished.” This repo already sets `autoDispose = false` in PokerRoom; verify it stays that way.

### DB latency guard in action path

Wrap DB calls that run **inside the action path** (before state transition or snapshot emit) with a timeout, e.g. `await withTimeout(prismaCall(), 2000)`. If the DB blocks, the action can still resolve (e.g. fail fast or use cached state) and a snapshot can still be emitted, so DB stalls don’t freeze the game.

### 7. Stale turn log

If waiting for a player and no progress for 20s, log:

```js
if (this.state.waitingForPlayer && Date.now() - this.turnStartedAt > 20000) {
  console.warn("TURN_STALLED", this.tableId, this.currentPlayer.userId);
}
```

---

## Four reliability pillars

Once these are in place, stalls largely disappear:

1. **Dealer tick loop** — Authoritative tick; process actions and emit snapshots on a schedule so one lost action doesn’t freeze the game.
2. **Session replacement by userId** — Reconnecting client replaces old session for same user; no “old sessionId owns the turn” deadlock.
3. **Action idempotency** — Prevents duplicate or lost actions from causing inconsistent state.
4. **Dead connection detection** — Server pings/heartbeat; client “no message for 20s → reconnect”; log and act on TABLE_STALLED / TURN_STALLED.

---

## Quick checklist (prod vs localhost)

| Area              | Check |
|-------------------|--------|
| URL               | Prod build uses `wss://...railway.app` for Colyseus and API. |
| CORS              | Web origin is in `CORS_ORIGINS` on the API service. |
| Single process    | Only one API/realtime instance (no multi-replica Colyseus without Redis). |
| Timeouts          | Proxy/load balancer idle timeout > client reconnect and Colyseus reconnect window. |
| Graceful shutdown | Server drains WebSockets and in-flight work on SIGTERM. |
| DB                | Prisma pool size and MySQL latency acceptable under prod load. |
| Logs              | Colyseus/Express errors and disconnect/reconnect events visible in prod. |

---

## PR task list: high-value hardening

Use this as the checklist for a single PR. **Implementation order** below gives diagnostics first, then fixes.

### Recommended order

1. Heartbeat (pingInterval + pingMaxRetries)  
2. Session replacement verification  
3. Action lifecycle logging (with latencyMs)  
4. Event loop monitor  
5. TABLE_STALLED detection + **auto-recovery**  
6. TURN_STALLED logging  
7. Client reconnect detection  

### Server

- [ ] **1. WebSocket heartbeat (proxy idle timeout)**  
  In `src/index.ts`, configure `WebSocketTransport` with:
  - **`pingInterval: 15000`** (15s) so Railway’s proxy doesn’t close “idle” connections.
  - **`pingMaxRetries: 2`** so the server disconnects after ~30–45s with no pong — prevents zombie sockets.
  Colyseus `@colyseus/ws-transport` supports both. Optionally log transport `close`/`error` if exposed.

- [ ] **2. Session replacement verification and log**  
  Verify: when a client **joins** and `userId` already has a seat, we replace the bound client (no second seat). In **`rebindClientExclusive`**: ensure old client is removed, `player.client` and session maps updated, and old client listeners cleared so the Dealer never holds a stale reference. Add **SESSION_REPLACED** (or **POKER_JOIN_SESSION_REPLACED**) log when rebinding. **Reconnect desync fix:** after any reconnect/restore, consider **`emitSnapshotToAll("PLAYER_RECONNECTED")`** (or equivalent) so all clients stay in sync; today only `emitSnapshotToUser(userId, "RECONNECT")` runs, so other players may not see updated state.

- [ ] **3. Action lifecycle logging (with latency)**  
  Log chain: **ACTION_RECEIVED** (with `tableId`, `handId`, `userId`, `sessionId`) → **ACTION_APPLIED** (with **`latencyMs`** from receive to apply) → **SNAPSHOT_EMITTED** (with **`latencyMs`** from apply to emit, plus `tableId`, `snapshotSeq`, `reason`). When rejecting an action, log **ACTION_REJECTED** with **reason** (e.g. `NOT_YOUR_TURN`) so “action never registered” is never a silent return.

- [ ] **4. Event loop lag monitor**  
  In `src/index.ts`, add `monitorEventLoopDelay` (from `perf_hooks`): enable, then every 5s log mean lag in ms. Log only when lag > 50ms to reduce noise.

- [ ] **5. TABLE_STALLED detection + auto-recovery**  
  Track `lastSnapshotAt` per room; periodic check (e.g. every 10s). When `Date.now() - table.lastSnapshotAt > 15000`:
  - Log **TABLE_STALLED** with `tableId`.
  - Call **`dealer.forceProgress()`** (or equivalent): e.g. waiting for player → auto-fold; betting round stuck → advance round; snapshot lost → re-emit snapshot. Prevents production from accumulating dead tables until restart. Optionally log **action queue depth** (e.g. in TABLE_STALLED or periodically when depth > 0) as a signal for event-loop blocking.

- [ ] **6. TURN_STALLED log**  
  When the game is waiting for a human and `Date.now() - turnStartedAt > 20000`, log **TURN_STALLED** with `tableId` and `currentPlayer.userId`. After recovery (e.g. auto-fold), log **AUTO_FOLD** and **SNAPSHOT_EMITTED** so root cause is obvious.

- [ ] **Verify Colyseus autoDispose**  
  Ensure `room.autoDispose = false` when using `allowReconnection` (this repo already sets it in PokerRoom; keep it).

- [ ] **DB timeout in action path (optional but high value)**  
  Wrap DB calls that run inside the action path with a timeout (e.g. `withTimeout(prismaCall(), 2000)`). If DB blocks, action can fail fast or use fallback and snapshot can still emit, so DB stalls don’t freeze the game.

### Client

- [ ] **7. Dead connection detection (smarter)**  
  Track last received message (or last **TABLE_SNAPSHOT**) per table. Trigger reconnect only when: **no snapshot for 20s AND** it’s the current player’s turn (or similar “we should be getting updates” condition). Avoids unnecessary reconnects on intentionally idle tables (e.g. waiting for other players).

### Out of scope for this PR (future work)

- Authoritative Dealer tick loop (larger refactor).
- Action idempotency (e.g. idempotency keys) — add when needed.
- Graceful shutdown is already implemented (`gameServer.gracefullyShutdown` on SIGTERM).

### Expected logs after this PR

- Normal flow: `ACTION_RECEIVED` → `ACTION_APPLIED` → `SNAPSHOT_EMITTED` (with latencyMs).
- Stalled turn: `TURN_STALLED table=abc player=42` → `AUTO_FOLD` → `SNAPSHOT_EMITTED`.
- Stalled table: `TABLE_STALLED table=abc` → `FORCE_SNAPSHOT` (or equivalent recovery log).

Root cause becomes easy to identify.

---

## Do now vs do later

**Do now (high value, low complexity)** — ~95% of reliability gain with minimal code:

1. WebSocket heartbeat (`pingInterval: 15000`, `pingMaxRetries: 2`) — very likely needed on Railway; prevents proxy idle timeout killing sockets.
2. Action lifecycle logging (ACTION_RECEIVED / APPLIED / SNAPSHOT_EMITTED with latencyMs and ACTION_REJECTED reason) — massive visibility for debugging stalls.
3. Event loop lag monitor — small; Railway CPU is slower than localhost.
4. Session replacement by userId — ensure rebind is correct and log SESSION_REPLACED; consider emitToAll after reconnect so table stays in sync.

**Do later if needed:**

- Dealer tick loop — good architecture but larger refactor; you can ship stable poker without it if timeouts and watchdogs are robust.
- Heavy stall recovery (forceProgress, auto-fold watchdog) — belt-and-suspenders; if TURN_TIMEOUT_TOTAL_MS and TABLE_STALLED recovery exist, you may not need more initially.
- Full authoritative tick engine — only if you run hundreds of tables.

**Probably not needed yet:** complex stall recovery logic, full tick engine, unless at scale.

**Minimal hardening PR (if scope is tight):** Implement only: (1) pingInterval + pingMaxRetries, (2) session replacement verification + reconnect emitToAll fix, (3) action lifecycle logging with latency, (4) event loop monitor. That’s on the order of 100 lines and will likely expose the real cause.

---

## Two production-only failure modes to check

These can produce “user action never registered, game unplayable” in production:

1. **After reconnect, only reconnecting client gets a snapshot** — Today: `emitSnapshotToUser(userId, "RECONNECT")`. Other players get nothing. If the reconnecting player owned the turn, others may still think “waiting for player X” while the reconnecting client has different state → desync/stall. **Safer:** after reconnect/restore, `emitSnapshotToAll("PLAYER_RECONNECTED")` (or equivalent) so the whole table stays consistent.

2. **rebindClientExclusive timing** — If the old client is not fully removed (maps + listeners) before the new client is bound, the Dealer can still hold the old reference. Then: action arrives on new socket, Dealer checks old socket, action ignored; or snapshot goes to wrong client. **Defensive:** in rebindClientExclusive: remove old client from maps, update player.client and sessionId, remove listeners from old client; only then set new client.

Also worth checking: **Dealer.handleAction**, **ActionService**, **TurnManager** for any `if (!condition) return` that rejects an action without logging (e.g. NOT_YOUR_TURN). Always log **ACTION_REJECTED reason=…** so production stalls are traceable.

---

## Worth it?

**Yes.** The minimal set (heartbeat, session replacement verification, action lifecycle with latency and rejection reason, event loop monitor) is **high value and low complexity** — likely fixes or at least exposes the most common production failure (proxy idle timeout or reconnect/session race). Implementing that first is worth it.

Adding **TABLE_STALLED + auto-recovery** (forceProgress) and **DB timeout** in the action path is **high impact** for production: it prevents long-lived dead tables and DB-freeze stalls. Worth including if `forceProgress` can be implemented without large refactors (e.g. auto-fold when waiting for player, re-emit snapshot when no recent emit).

The **reconnect refinements** (emitToAll after reconnect, rebindClientExclusive correctness, ACTION_REJECTED logging) are targeted and worth it. The **full tick loop** and heavy watchdog logic can be phased in later; start with heartbeat + logging + session verification + event loop monitor, then add stall recovery and DB timeout as the next step.

**Most likely production culprit** given “stale games / action never registered”: **proxy idle timeout + no heartbeat**. That exact failure gives: client connected, server connected, messages silently disappear, table stalls. The heartbeat fix will likely reduce the issue dramatically.

---

## Full brainstorm (reference)

Below is the original broad list for completeness.

### Network & proxy

- Load balancer / proxy idle timeout (see § Highest-probability #1).
- WSS vs WS; different latency; packet loss / congestion.

### Railway platform

- Cold starts; single instance / no sticky sessions; memory/CPU limits; ephemeral FS; SIGTERM on deploy.

### WebSocket / Colyseus

- Ping/pong or keepalive; backpressure; message ordering; reconnect window; room disposal.

### Client-side

- Wrong or stale URL; reconnect delay; auth/token; multiple tabs; background tab / mobile.

### Server event loop & I/O

- Blocking event loop (see § Highest-probability #2); DB latency (#4); pool exhaustion; avatar fetch timeout.

### Environment & config

- CORS; env vars not set in prod; log level.

### Message path & protocol

- ACTION payload/schema; table join options; snapshot emission errors; rate limiting.

### Deployment & lifecycle

- Deploy during a hand; health checks; no graceful shutdown.

---

*Prioritization and Colyseus/session-replacement content added from production hardening feedback. Prioritize by symptom: stall after N minutes → idle timeout; stall on deploy → lifecycle; stall under load → event loop or DB.*

---

## Final production review (implemented vs remaining)

**Scope:** What was implemented in code vs what remains from the PR task list. Use this for a final prod readiness check.

### Implemented

| Item | Location | Notes |
|------|----------|--------|
| **Old session map cleanup** | `PokerRoom.rebindClientExclusive` | `userIdBySessionId.delete(oldClient.sessionId)`, `bindingEpochBySessionId.delete(oldClient.sessionId)` before binding new client. |
| **SESSION_REBOUND log** | `PokerRoom.rebindClientExclusive` | `logger.info({ tableId, userId, oldSession, newSession }, "SESSION_REBOUND")`. |
| **Epoch check in action path** | `PokerRoom` ACTION handler | `sessionEpoch !== expectedEpoch` → log `ACTION_REJECTED reason=STALE_SESSION`, return. |
| **ACTION_REJECTED with reason** | `PokerRoom` ACTION handler | `SESSION_NOT_BOUND`, `STALE_SESSION`, `INACTIVE_BOUND_CLIENT`; Dealer already logs `ACTION_REJECTED` with code for PokerError. |
| **Snapshot to all after rebind** | `PokerRoom` (4 call sites) | `emitSnapshotsToAll("RECONNECT")` or `emitSnapshotsToAll("JOIN")` so whole table gets state after reconnect/join. |
| **ACTION_QUEUE_DELAY** | `Dealer.handleAction` | `queuedAt` at enqueue; at run log `ACTION_QUEUE_DELAY` when `Date.now() - queuedAt > 100`. |
| **ACTION_DROPPED_HAND_CHANGED** | `Dealer.handleAction` | When `currentHandIdAtEnqueue && state.handId !== currentHandIdAtEnqueue`, log and return without applying. |
| **TABLE_STALLED detection** | `PokerRoom` | `lastSnapshotAt` updated in `onTableSnapshotEmitted`; 10s interval logs `TABLE_STALLED` if no snapshot for 15s; interval cleared in `onDispose`. |
| **autoDispose = false** | `PokerRoom` | Already set; no change needed. |
| **Graceful shutdown** | `src/index.ts` | `gameServer.gracefullyShutdown(false)` on SIGTERM. |

### Not implemented (recommended before or soon after prod)

| Item | Effort | Impact |
|------|--------|--------|
| **WebSocket heartbeat** | Small | High. In `src/index.ts`: `new WebSocketTransport({ server, pingInterval: 15000, pingMaxRetries: 2 })`. Reduces proxy idle timeout and zombie sockets. |
| **Event loop lag monitor** | Small | Diagnostic. In `index.ts`: `monitorEventLoopDelay()`, log every 5s when mean > 50ms. |
| **Action lifecycle latencyMs** | Small | Diagnostic. Add latency from receive→apply and apply→emit in PokerRoom/Dealer/SnapshotService logs. |
| **SNAPSHOT_EMITTED log** | Small | Diagnostic. Log after `emitToAll` in action path with tableId, snapshotSeq, reason. |
| **TURN_STALLED log** | Small | Diagnostic. In Dealer/turn path: when waiting for human and `Date.now() - turnStartedAt > 20000`, log with tableId, userId. |
| **TABLE_STALLED auto-recovery** | Medium | High. On TABLE_STALLED call `dealer.forceProgress()` (e.g. auto-fold or re-emit snapshot). Today only logging. |
| **Client: no snapshot 20s + turn** | Small | Reconnect only when no snapshot for 20s and it’s player’s turn; avoids unnecessary reconnects. |
| **DB timeout in action path** | Medium | Guard. `withTimeout(prismaCall(), 2000)` for DB calls inside action path so DB stalls don’t freeze the game. |

### Risks and follow-ups

- **Heartbeat missing:** Railway proxy can still close “idle” connections; implement `pingInterval`/`pingMaxRetries` before or immediately after deploy.
- **TABLE_STALLED is log-only:** Stalled tables will keep accumulating until restart until `forceProgress()` (or equivalent) is added.
- **Dealer rejections:** NOT_YOUR_TURN and similar are already logged via `emitDiagnostic` and `logger.warn` in Dealer; no change needed there.
- **Log volume:** ACTION_QUEUE_DELAY, ACTION_DROPPED_HAND_CHANGED, TABLE_STALLED, SESSION_REBOUND, ACTION_REJECTED are all warn/info; ensure log aggregation can handle the volume and you have alerts for TABLE_STALLED / ACTION_QUEUE_DELAY if desired.

### Pre-deploy checklist

- [ ] Railway: single replica for api-realtime (no multi-instance without Redis).
- [ ] Env: `CORS_ORIGINS` includes web origin; prod build has `EXPO_PUBLIC_COLYSEUS_URL` and API URL for Railway.
- [ ] Add WebSocket heartbeat in `index.ts` (recommended before prod).
- [ ] Optional: event loop monitor and latencyMs in action logs for first week of prod.
- [ ] After deploy: watch for TABLE_STALLED, ACTION_QUEUE_DELAY, ACTION_REJECTED reason=STALE_SESSION in logs to confirm diagnostics and tune heartbeat/recovery if needed.

---

## Final review: critical / high-value only

**In scope:** Only items that are critical or high-value for production stalls. Everything else is out of scope for this review.

### Critical / high-value — implemented

| Item | Why it matters |
|------|----------------|
| **WebSocket heartbeat** (`index.ts`: `pingInterval: 15_000`, `pingMaxRetries: 2`) | Reduces proxy idle timeout killing connections; closes zombie sockets after ~30–45s. |
| **Session rebind cleanup** (delete old `sessionId` from `userIdBySessionId` and `bindingEpochBySessionId` in `rebindClientExclusive`) | Prevents stale session map and wrong-user resolution after reconnect. |
| **Epoch check in action handler** (`sessionEpoch !== expectedEpoch` → reject + log) | Stale socket cannot apply actions after rebind. |
| **Snapshot to all after rebind/join** (`emitSnapshotsToAll("RECONNECT")` / `"JOIN"`) | Whole table stays in sync; no “only reconnecting client got update” desync. |
| **ACTION_REJECTED with reason** (SESSION_NOT_BOUND, STALE_SESSION, INACTIVE_BOUND_CLIENT; Dealer already logs code) | “Action never registered” is never silent; root cause is visible in logs. |
| **TABLE_STALLED detection** (10s check, 15s threshold, log only) | Surfaces dead tables in prod; interval cleared on dispose. |
| **Graceful shutdown** (`gameServer.gracefullyShutdown` on SIGTERM) | Deploy/restart doesn’t leave clients stuck. |
| **autoDispose = false** | Reconnect path works; room isn’t disposed when empty briefly. |

### High-value diagnostics — implemented

| Item | Why it matters |
|------|----------------|
| **ACTION_QUEUE_DELAY** (log when queue wait > 100ms) | Shows when Railway CPU or blocking is causing backlog. |
| **ACTION_DROPPED_HAND_CHANGED** (log when hand changed before action ran) | Surfaces hand-boundary races. |
| **SESSION_REBOUND** log (tableId, userId, oldSession, newSession) | Correlate session churn with stalls. |
| **Event loop lag** (log when mean > 50ms every 5s) | Confirms or rules out event-loop blocking. |

### Critical / high-value — not implemented

| Item | Risk if missing |
|------|-----------------|
| **TABLE_STALLED auto-recovery** (e.g. `dealer.forceProgress()` or re-emit) | Stalled tables accumulate until restart; today only logging. |
| **Client: reconnect when no snapshot 20s and turn active** | Optional; reduces unnecessary reconnects; not critical for “stale game” fix. |

### Pre-deploy (critical only)

1. **Single replica** for api-realtime.
2. **Env:** `CORS_ORIGINS` and prod `EXPO_PUBLIC_COLYSEUS_URL` / API URL correct.
3. **After deploy:** Watch **TABLE_STALLED**, **ACTION_QUEUE_DELAY**, **ACTION_REJECTED reason=STALE_SESSION**; add TABLE_STALLED recovery later if needed.

---

## Final review (post-implementation)

Single checklist of what is implemented after all hardening and diagnostic work. Use for sign-off and prod verification.

### Server process (`src/index.ts`)

| Item | Status |
|------|--------|
| WebSocket heartbeat | `pingInterval: 15_000`, `pingMaxRetries: 2` |
| Event loop lag monitor | `monitorEventLoopDelay`, log every 5s when mean > 50ms (`EVENT_LOOP_LAG`) |
| Graceful shutdown | `gameServer.gracefullyShutdown(false)`; eventLoopLagInterval cleared |

### Session and rebind (`PokerRoom`)

| Item | Status |
|------|--------|
| Old session map cleanup | `userIdBySessionId.delete(oldClient.sessionId)`, `bindingEpochBySessionId.delete(oldClient.sessionId)` in `rebindClientExclusive` |
| SESSION_REBOUND log | `tableId`, `userId`, `oldSession`, `newSession` |
| Snapshot to all after rebind/join | `emitSnapshotsToAll("RECONNECT")` or `("JOIN")` at all 4 rebind/join sites |
| Epoch check in action handler | Reject when `sessionEpoch !== expectedEpoch`; log `ACTION_REJECTED reason=STALE_SESSION` |
| ACTION_REJECTED with reason | `SESSION_NOT_BOUND`, `STALE_SESSION`, `INACTIVE_BOUND_CLIENT`; Dealer logs code for PokerError |

### Action path and diagnostics (`Dealer`, `TurnManager`)

| Item | Status |
|------|--------|
| ACTION_QUEUE_DELAY | When queue wait > 100ms; includes `tableId`, `handId`, `userId`, `action`, `actionId`, `delay`, `queueDepth` |
| ACTION_DROPPED_HAND_CHANGED | When hand changed before action ran; includes `tableId`, `handId`, `userId`, `actionId`, `enqueuedHandId`, `currentHandId`, `street` |
| ACTION_DUPLICATE_IGNORED | When duplicate action key; includes `tableId`, `handId`, `userId`, `actionId`, `action`; `pendingActorRef` cleared before return |
| ACTION_ACCEPTED | In `_handleAction` after execution; includes `tableId`, `handId`, `userId`, `action` |
| getQueueDepth / QUEUE_DEPTH_HIGH | `TurnManager.getQueueDepth()`; PokerRoom stall check logs `QUEUE_DEPTH_HIGH` when depth ≥ 2 (with `handId`) |
| TURN_STALLED | `Dealer.logTurnStalledIfNeeded()` from PokerRoom stall interval; logs when turn > TURN_TIMEOUT_TOTAL_MS + 5s; includes `tableId`, `handId`, `seat`, `street` |
| getTurnStartTs | `TurnTimeoutScheduler.turnStartedAt` set/cleared; `TurnManager.getTurnStartTs()` |

### Table stall detection (`PokerRoom`)

| Item | Status |
|------|--------|
| lastSnapshotAt | Set in `onTableSnapshotEmitted` (hook called only from SnapshotService.emitToAll/emitToUser) |
| lastSnapshotSeq | Set from `snapshot.payloadJson?.snapshotSeq` in hook |
| TABLE_STALLED | Every 10s; when no snapshot 15s log with `roomId`, `tableId`, `handId`, `street`, `snapshotSeq`, `lastSnapshotAt` |
| Stall interval cleanup | `stallCheckInterval` cleared in `onDispose` |

### Room config

| Item | Status |
|------|--------|
| autoDispose | `false` in PokerRoom |

### Log chain for debugging stalls

- **Normal:** POKER_ACTION_ATTEMPT → ACTION_ACCEPTED → (snapshot) → POKER_ACTION_ACCEPTED  
- **Rejections:** ACTION_REJECTED reason=… (SESSION_NOT_BOUND | STALE_SESSION | INACTIVE_BOUND_CLIENT) or POKER_ACTION_REJECTED with code  
- **Stall signals:** TABLE_STALLED, TURN_STALLED, ACTION_QUEUE_DELAY, QUEUE_DEPTH_HIGH, EVENT_LOOP_LAG  
- **Context:** All table/action diagnostics include `handId` (and where relevant `street`, `snapshotSeq`) for isolation

### Not implemented (optional / later)

- TABLE_STALLED **auto-recovery** (forceProgress / re-emit snapshot)
- Client: reconnect only when no snapshot 20s **and** player’s turn
- SNAPSHOT_EMITTED log (action lifecycle); latencyMs on action logs
- DB timeout wrapper in action path
