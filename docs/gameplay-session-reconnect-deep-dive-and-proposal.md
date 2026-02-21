# Gameplay Session Reconnect Deep Dive and Hardening Proposal (Current State)

## Scope

This document tracks gameplay reconnect reliability, with emphasis on page reload reconnect for seated players.

## Status Summary (as of February 19, 2026)

### Implemented

1. Connect is no longer gated by buy-in presence.
- `apps/client/app/table/[id].tsx`
- Realtime connect now starts when auth is ready and token exists.

2. Table realtime join options always include `tableId`; `buyInCents` is optional.
- `apps/client/src/realtime/useTableRealtime.ts`

3. `SESSION_RESTORED` now maps to `CONNECTED`.
- `apps/client/src/registry/realtime-channel.registry.ts`

4. Single-session reclaim hardening on server.
- `src/rooms/PokerRoom.ts`
- New socket replaces old socket for the same `userId` at the table.
- Stale `onLeave` from old socket is ignored.

5. Stale socket command hardening.
- `src/rooms/PokerRoom.ts`
- `ACTION`, `CHAT`, `ADD_BOT`, `REMOVE_BOT` now ignore stale non-bound sockets.

6. Durable reconnect metadata persisted with TTL.
- `apps/client/src/stores/multitable.store.ts`
- Persisted fields:
  - `roomIdByTableId`
  - `lastBuyInCentsByTableId`
  - `tableMetaUpdatedAt`
- TTL: 24h via `pruneExpiredTables()`.
- Boot prune call added:
  - `apps/client/app/_layout.tsx`

7. Reload fallbacks now consume persisted metadata.
- `apps/client/app/table/[id].tsx`
- Room resolution prefers persisted `roomIdByTableId`.
- Buy-in resolution now falls back to persisted `lastBuyInCentsByTableId`.

8. Tests added for metadata persistence + TTL behavior.
- `apps/client/src/tests/multitable.store.metadata.test.ts`

### Validation performed

- Client typecheck passed.
- Server typecheck passed.
- Client tests passed.
- Server join/rejoin guard tests passed.

## Current reconnect behavior

### What now works better

- Reload reconnect is deterministic for seated users even when buy-in is missing in URL.
- Reconnect can proceed from persisted room/buy-in context after memory reset.
- Old/stale sockets are replaced and made inert to prevent dual-control edge cases.

### Remaining known weaknesses

1. Room identity resolution still includes heuristic fallback in transport.
- `apps/client/src/realtime/transport.ts`

2. No explicit session-generation fencing in client realtime lifecycle.

3. Backoff policy remains simple fixed-delay reconnect rather than jittered exponential.

4. No canonical `connect-target` endpoint yet.

## Updated Plan

### Phase 1

Completed.

### Phase 2 (next)

1. Add client session-generation guard in realtime channel/transport.
2. Upgrade reconnect backoff to exponential + jitter + cap.
3. Add structured reconnect telemetry:
   - `tableId`, `roomId`, `attempt`, `joinMode`, `errorCode`, `latencyMs`.

### Phase 3 (after Phase 2 evidence)

1. Add canonical room resolution endpoint:
   - `GET /api/lobby/tables/:tableId/connect-target`
2. Remove room-id guessing/recovery heuristics in client transport.
3. (Optional) Add explicit join intent contract for clarity, while keeping server authority.

## Recommendation

Proceed with Phase 2 now. The MVP-critical reconnect blockers are already addressed; next gains are race resistance and observability.
