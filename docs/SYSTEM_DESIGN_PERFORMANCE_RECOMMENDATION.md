# System Design Performance Recommendation

**Target:** >1000 simultaneous poker games  
**Platform:** Railway (no Redis, dedicated services available)  
**Date:** February 2025

---

## Executive Summary

This document reviews `src/index.ts`, `PokerRoom`, and Colyseus multi-room management. It provides enterprise-grade recommendations to harden the server for >1000 concurrent games, protect memory and message consistency, and identifies footguns. Solutions are prioritized by value and feasibility on Railway without Redis.

---

## 1. Current Architecture Snapshot

### 1.1 Process Model

- **Single Node.js process** – Express HTTP + Colyseus WebSocket share one `http.createServer()`
- **Colyseus** – One process hosts all rooms (lobby + poker). No worker threads. All rooms share the event loop.
- **PokerRoom** – `autoDispose = false`; rooms never auto-dispose. One Dealer per room, one `OddsCache` per Dealer (200-entry LRU).

### 1.2 Rate Limits (Current)

| Path | Limit | Window |
|------|-------|--------|
| `/api/auth/login` | 40 req | 15 min |
| `/api/auth/register` | 20 req | 15 min |
| `/api/auth` (general) | 120 req | 15 min |
| `/api/economy`, `/api/profile`, `/api/history`, `/api/lobby`, `/api/tournaments`, `/api/leaderboard` | **None** | — |
| Colyseus WebSocket (ACTION, CHAT, ADD_BOT, etc.) | **None** (except voice token bucket) | — |

### 1.3 Cache / Shared State

| Component | Type | Scope | Notes |
|-----------|------|-------|-------|
| `OddsCache` | LRU Map | Per PokerRoom | 200 entries × ~1KB ≈ 200KB per room; 1000 rooms ≈ 200MB |
| `PresenceIndex` | Map | **Global singleton** | `entriesByUserId` – unbounded growth with online users |
| Rate limit buckets | Map | Per middleware | `createIpRateLimit` – no TTL cleanup; buckets accumulate forever |
| `matchMaker` | Colyseus | Global | In-memory room registry |

### 1.4 Concurrency Control

- **Dealer action queue** – Per-room Promise chain (`actionQueue`); serializes `handleAction`, `addPlayer`, `removePlayer`, etc. Prevents interleaved mutations within a room.
- **Join lock** – Per-table per-user (`joinLocksByKey`) prevents concurrent joins for the same user.
- **No global admission control** – No cap on room count, HTTP request concurrency, or matchmaking rate.

---

## 2. Footguns

### 2.1 Memory

1. **Unbounded rate-limit buckets** – `createIpRateLimit` uses `Map<string, Bucket>` with no eviction. Long-lived process + many IPs ⇒ unbounded growth.
2. **PresenceIndex global Map** – Grows with all online users (lobby + tables). No size cap or TTL.
3. **OddsCache per room** – 1000 rooms × 200 entries = 200k entries. Each entry holds equity arrays. Est. 100–200MB+.
4. **`autoDispose = false`** – Empty tables never dispose. 1000 games ⇒ 1000 rooms even if many are idle.
5. **`processedActionIds`** – Per-room Set never pruned; grows per hand.
6. **`joinLocksByKey`** – Map entries removed on completion, but high churn can leave orphaned keys if errors occur.

### 2.2 Message Consistency

1. **No WebSocket backpressure** – Clients can flood ACTION/CHAT; Dealer queue can grow unbounded.
2. **LobbyRoom `LIST_TABLES`** – Calls `matchMaker.query({ name: "poker" })` on every request. 1000 rooms ⇒ large response + CPU for metadata mapping.
3. **`queryTables`** – Same query for CREATE_TABLE, JOIN_TABLE, LIST_TABLES. No caching; repeated DB-like workload on Colyseus metadata.
4. **PresenceIndex `notify`** – Broadcasts `totalOnline` to all lobby subscribers on every add/remove; no debounce beyond 100ms in LobbyRoom.

### 2.3 Database / I/O

1. **Single Prisma instance** – Default connection pool. No explicit `connection_limit`. 1000 rooms × concurrent LedgerService/CashierService calls ⇒ pool exhaustion risk.
2. **CashierService** – Shared stateless service; multiple concurrent buy-in/cash-out per table. Prisma transactions help but pool can still saturate.
3. **RecoveryService** – `reconcileAbandonedBalances` runs hourly; scans `PlayerBalance`, then `matchMaker.query`. Heavy at scale.
4. **Leaderboard aggregation** – `recomputeLeaderboardSafely` hourly; no circuit breaker or timeout.

### 2.4 Colyseus / Railway

1. **Single Colyseus process** – No Redis ⇒ no multi-process Colyseus. All 1000 rooms in one process.
2. **File descriptors** – Linux default ~1024. 1000 rooms × ~9 clients/room ⇒ 9k+ connections. Requires `ulimit -n` increase.
3. **Railway memory** – Default plan limits; 1000 rooms + Express + Prisma can exceed 512MB–1GB.

---

## 3. Prioritized Recommendations

### Tier 1 – Critical (Protect Stability)

#### 1.1 Cap In-Memory Growth

| Item | Action | Effort |
|------|--------|--------|
| Rate limit buckets | Add TTL sweep: remove buckets where `resetAt < now`. Run every `windowMs`. | Low |
| PresenceIndex | Add `maxEntries` (e.g. 50k) and evict LRU or reject new adds when full. | Low |
| OddsCache | Reduce `maxEntries` from 200 to 50–100 per room, or make it global with 5k–10k total. | Low |
| processedActionIds | Prune when `handId` advances: `if (state.handId !== handIdBefore) processedActionIds.clear()`. | Low |

#### 1.2 Global Rate Limits for Unprotected API Routes

Add `createIpRateLimit` to:

- `/api/economy` – 60 req/15 min (buy-in/cash-out are critical)
- `/api/history` – 120 req/15 min (read-heavy)
- `/api/lobby` – 180 req/15 min (list tables)
- `/api/profile` – 60 req/15 min

Use shared middleware composition to avoid duplication.

#### 1.3 Room Lifecycle Policy

Introduce **manual disposal** for empty tables:

- Option A: Background job scans `matchMaker.query` for poker rooms with 0 clients for >30 min; call `room.disconnect()`.
- Option B: Add `MAX_IDLE_ROOMS` env; when exceeded, dispose oldest empty rooms first.
- Keep `autoDispose = false` for tables with seated players; only dispose when empty + idle.

#### 1.4 Prisma Connection Pool

Set explicit pool size:

```ts
// db/prisma.ts
prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes("?") ? "&" : "?") + "connection_limit=20"
    }
  }
});
```

Tune `connection_limit` based on Railway DB plan (e.g. 10–30 for small Postgres).

---

### Tier 2 – High Value (Protect UX and Consistency)

#### 2.1 WebSocket Message Rate Limit

Add per-room, per-client rate limit for ACTION and CHAT:

- Token bucket or sliding window: e.g. 30 ACTION/min, 20 CHAT/min per client.
- Drop or reject excess messages with `ERROR` code `RATE_LIMITED`.
- Implement in PokerRoom `onMessage` before Dealer/chat logic.

#### 2.2 Lobby `queryTables` Caching

- Cache `matchMaker.query({ name: "poker" })` result for 2–5 seconds.
- Invalidate on `CREATE_TABLE`, `TABLE_CREATED`, or `requestDisconnect` (table disposed).
- Reduces CPU and latency for LIST_TABLES and JOIN_TABLE flows.

#### 2.3 Backpressure on Dealer Action Queue

- Add `maxQueuedActions` (e.g. 50) per room.
- If queue depth exceeds limit, respond `ERROR` with `code: "QUEUE_FULL"` and `retryAfterSeconds`.
- Prevents runaway memory from client floods.

#### 2.4 Structured Shutdown

- Extend `shutdown()` to drain Colyseus rooms gracefully: wait for in-flight actions, then `gameServer.gracefullyShutdown(true)`.
- Add `SIGTERM` timeout: if shutdown exceeds 30s, force exit.
- Railway sends SIGTERM on deploy; clean shutdown avoids lost state.

---

### Tier 3 – Railway-Optimized (Without Redis)

#### 3.1 Separate API and Colyseus Services

- **Service A:** Express HTTP only (auth, economy, profile, history, lobby REST, health).
- **Service B:** Colyseus WebSocket only (matchmake, poker rooms).
- Use Railway’s internal networking or a shared domain with path-based routing.
- Benefits: Independent scaling, memory isolation, API can scale horizontally.

#### 3.2 Colyseus Memory Guard

- Set `NODE_OPTIONS=--max-old-space-size=1024` (or 512) for Colyseus service.
- Add periodic `process.memoryUsage()` logging; alert when heap > 80% of limit.
- Consider room count cap: `matchMaker.createRoom` fails if `rooms.length >= MAX_ROOMS` (e.g. 800–1000).

#### 3.3 In-Process Admission Control

Before `matchMaker.createRoom("poker", ...)`:

```ts
const rooms = await matchMaker.query({ name: "poker" });
if (rooms.length >= parseInt(process.env.MAX_POKER_ROOMS ?? "1000", 10)) {
  throw new Error("Table creation paused. Try again later.");
}
```

Return user-friendly error; prevents OOM from unbounded room creation.

#### 3.4 Health Checks

- `/health` – Fast, no DB. Return 200.
- `/health/ready` – Optional: check Prisma connectivity + room count < threshold. Use for Railway readiness probe.
- Colyseus service: expose `/health` on same HTTP server; avoid DB in hot path.

---

### Tier 4 – Message Consistency Hardening

#### 4.1 Action Idempotency

- `actionId` already used for de-duplication in Dealer. Ensure all clients send `actionId` for ACTION messages.
- Document and enforce client contract: always include `actionId` for retries.

#### 4.2 Snapshot Ordering

- Colyseus state patches are ordered per room. Ensure Dealer emits snapshots only after state mutation completes.
- Current flow (actionQueue → mutation → snapshot) preserves order; maintain this pattern.

#### 4.3 PresenceIndex Consistency

- `add`/`remove` are synchronous. Subscriber `notify` is fire-and-forget. Already defensive (swallow subscriber errors).
- Consider moving PresenceIndex to a separate small service if you later scale Colyseus horizontally (would require Redis or similar).

---

## 4. Cache Strategy (Without Redis)

| What | Where | Mechanism | Max Size |
|------|-------|-----------|----------|
| Rate limit buckets | Process | Map + TTL sweep | 100k IPs (sweep stale) |
| Lobby table list | Process | In-memory + 2–5s TTL | 1 object |
| Odds/equity | Per room or global | LRU (OddsCache) | 5k–10k total entries |
| Auth session | DB (existing) | Prisma + session store | N/A |

No Redis required. All caches are process-local. For multi-instance API scaling later, consider Railway’s Redis add-on or external Redis for rate limits and lobby cache.

---

## 5. Implementation Order

**Completed (TDD):**
- Tier 1.1: Rate limit TTL sweep, PresenceIndex `maxEntries` cap, OddsCache 50-entry default, processedActionIds prune on hand change.
- Tier 2.1: WebSocket per-client rate limit (ACTION 30/min, CHAT 20/min).
- Tier 2.3: Dealer max queue depth (50), QUEUE_FULL on overflow.
- serverSeq + actionId: actionId required for ACTION; serverSeq in `lastAction.seq`, `snapshotSeq`.

**Remaining:**
1. **Week 1:** Tier 1.4 (Prisma pool), 1.2 (API rate limits), 1.3 (room lifecycle policy).
2. **Week 2:** Tier 2.2 (lobby cache), 2.4 (shutdown).
3. **Week 3+:** Tier 3 (service split, admission control, memory guard).

---

## 6. Monitoring Checklist

- [ ] `process.memoryUsage().heapUsed` logged every 5 min
- [ ] Colyseus room count: `matchMaker.query({ name: "poker" }).length`
- [ ] Prisma pool: `$metrics` or connection count if available
- [ ] Rate limit 429s per route
- [ ] Dealer action queue depth (if instrumented)
- [ ] RecoveryService / Leaderboard job duration and errors

---

## 7. References

- `src/index.ts` – Server bootstrap, rate limits, shutdown
- `src/rooms/PokerRoom.ts` – Room lifecycle, join locks, PresenceIndex
- `src/engine/Dealer.ts` – actionQueue, OddsCache, serialized mutations
- `src/http/middleware/rateLimit.ts` – In-memory bucket implementation
- `src/lobby/PresenceIndex.ts` – Global presence Map
- `src/engine/odds/OddsCache.ts` – Per-room LRU
- Colyseus Scalability: https://docs.colyseus.io/deployment/scalability
