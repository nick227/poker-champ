# Gameplay Session Reconnect Deep Dive and Hardening Proposal

## Scope

Focus area: gameplay session stability when a player reloads the table page and expects to rejoin the same live table cleanly.

## Current System Inventory

### What is already solid

- Server auth gating is strict and correct:
  - `src/rooms/PokerRoom.ts` authenticates via bearer token in `onAuth`.
  - Table join is blocked without valid session token.
- Server reconnect logic is authoritative:
  - `src/rooms/PokerRoom.ts:onJoin` restores if player already exists in room state.
  - If persistent seats are enabled, it can restore from seat-session storage even when not currently bound.
- Client prevents pre-hydration join attempts:
  - `apps/client/src/realtime/useRealtimeChannel.ts:canStartRealtimeSession` blocks table realtime before auth hydration + token.
- Snapshot sequencing protection exists:
  - `apps/client/src/stores/table.store.ts` drops stale snapshots by `snapshotSeq`.

### Current reconnect path (today)

1. Table screen computes `tableId`, `buyInCents`, and `realtimeRoomId` in `apps/client/app/table/[id].tsx`.
2. `useTableRealtime` builds `joinOptions` only when `buyInCents` is valid.
3. `useRealtimeChannel` opens a Colyseus session using `id = roomId ?? tableId`.
4. Colyseus transport may attempt roomId recovery via `lobby.listTables()` if join-by-id fails.
5. Server either restores existing/persisted seat (no buy-in needed) or treats as new join (buy-in required).

## Why reload reconnect still feels erratic

### 1. Connection is incorrectly gated on buy-in presence

In `apps/client/app/table/[id].tsx`, `shouldConnectRealtime = Boolean(snapshot) || hasValidBuyIn`.

On full reload, `snapshot` is empty and in-memory `joinState` is often gone, so reconnect may not even start until buy-in is rediscovered.

Impact:
- Player can land on table route but remain disconnected despite having a valid restorable seat.
- Behavior differs depending on whether buy-in is present in URL/store, which feels random.

### 2. Navigation often drops buy-in

`tablePath(id)` is used without `buyInCents` in multiple places:
- `apps/client/src/components/domain/table/MultiTableTabs.tsx`
- `apps/client/app/lobby.tsx` (active table selection)
- `apps/client/app/table/[id].tsx` (active table selection)

After reload, this amplifies issue #1 because no durable join input remains.

### 3. Reload reconnect depends on volatile in-memory join state

`tableJoinById` lives in Zustand memory (`apps/client/src/stores/multitable.store.ts`) with no persistence.

Impact:
- Works in-session.
- Breaks or degrades after hard reload/tab restore.

### 4. Table identity is ambiguous (tableId vs roomId)

Current client sometimes passes tableId as roomId and then does recovery in transport:
- `apps/client/src/realtime/transport.ts` preflight/repair logic.

Impact:
- Extra recovery branch complexity.
- Additional race windows and non-deterministic timing.

### 5. Status handling is inconsistent for SESSION_RESTORED

`apps/client/src/registry/realtime-channel.registry.ts` maps `SESSION_RESTORED` to `setStatus("RESTORED")`, but table connection state is modeled as `CONNECTED | RECONNECTING | DISCONNECTED`.

Impact:
- UI state can drift or display awkward intermediate labels.
- Makes diagnostics harder.

### 6. Transport lifecycle lacks generation guards

Transport reconnect code can emit async events while hooks are re-instantiating sessions.

Impact:
- Older session callbacks can race with newer session setup.
- Status flicker / stale error noise under churn.

## Core Design Change

Treat reconnect and new join as separate intents.

- Reconnect intent should require only:
  - auth token
  - tableId
- New join intent should require:
  - auth token
  - tableId
  - buyInCents (and password if needed)

This matches server behavior already present in `PokerRoom.onJoin`: restore paths run before buy-in schema validation.

## Proposed Robust Architecture

### A. Client state machine for table session

Introduce explicit client session phases per table:
- `AUTH_WAIT`
- `TARGET_RESOLVING`
- `CONNECTING`
- `RESTORING`
- `LIVE`
- `RETRY_BACKOFF`
- `FATAL`

Replace implicit booleans (`snapshot`, `hasValidBuyIn`, `tableStatus`) with this state machine to avoid hidden branch coupling.

### B. Always attempt restore when authed on table route

In table screen:
- Remove `hasValidBuyIn` as connection prerequisite.
- Start realtime when `authHydrated && authToken && tableId`.
- Send join options with `tableId` always.
- Include `buyInCents` only when available.

Server outcome:
- If seat is restorable: restore succeeds without buy-in.
- If seat is not restorable and buy-in missing: deterministic `MISSING_BUY_IN_CENTS`, then client prompts buy-in modal.

### C. Durable client session metadata

Persist minimal table session metadata (local storage) with TTL, e.g.:
- `tableId`
- `lastKnownRoomId`
- `lastBuyInCents` (optional)
- `updatedAt`

Use Zustand `persist` for `tableJoinById` and room mapping.

### D. Canonical room resolution contract

Add an HTTP endpoint (or expand lobby list usage) for deterministic mapping:
- `GET /api/lobby/tables/:tableId/connect-target`
- Returns `{ tableId, roomId, exists }`

Then:
- Always join by canonical `roomId`.
- Remove tableId-as-roomId guessing and recovery heuristics from transport.

### E. Unify connection status semantics

Map `SESSION_RESTORED` to connection `CONNECTED` and separate a non-connection event flag if needed (`lastJoinMode = RESTORE`).

### F. Session generation guard

Add monotonic `sessionGeneration` in realtime hook/transport.
- Increment on each connect attempt lifecycle reset.
- Ignore callbacks/events from stale generations.

### G. Backoff policy hardening

Adopt exponential backoff with jitter and cap, e.g.:
- base 500ms, factor 1.8, max 10s, +-20% jitter
- reset backoff on successful `CONNECTED`

## Proposed Implementation Plan

### Phase 1 (high impact, low risk)

1. Decouple connection start from buy-in in `apps/client/app/table/[id].tsx`.
2. Ensure `joinOptions` always includes `tableId`; `buyInCents` optional.
3. Normalize `SESSION_RESTORED` -> `CONNECTED` status handling.
4. Persist `tableJoinById` and `roomIdByTableId` with Zustand `persist`.

Expected result: page reload reconnect becomes mostly deterministic for existing players.

### Phase 2 (stability and observability)

1. Add session-generation guard in `useRealtimeChannel` + transport.
2. Implement exponential backoff with jitter.
3. Add structured client logs with correlation fields:
   - `tableId`, `roomId`, `generation`, `phase`, `joinMode`, `attempt`, `errorCode`.

Expected result: less status flicker, fewer race artifacts, easier debugging.

### Phase 3 (contract cleanup)

1. Add connect-target endpoint and remove room-guess recovery logic.
2. Introduce explicit server/client join intent typing:
   - `joinIntent: "RESTORE" | "NEW"`
3. Keep server as final authority for restore/new decision.

Expected result: simpler code paths, lower reconnect complexity, fewer edge-case retries.

## Test Plan Additions

### Client tests

- Reload path with token + tableId + no buy-in should still attempt connect.
- `SESSION_RESTORED` must set connection status to `CONNECTED`.
- Stale generation callbacks are ignored after session restart.
- Persisted `roomIdByTableId` used after reload.

### Integration tests

- User seated, hard reload, reconnect within 60s -> receives `SESSION_RESTORED` + snapshot.
- User not seated, no buy-in -> receives deterministic buy-in-required error and no infinite retry.
- Room id rotates/recreated -> client resolves new room and reconnects.

### Soak test

- Script 100 repeated browser reload cycles during active hands for 2-4 users; assert:
  - no duplicate seating
  - no invariant violations
  - bounded reconnect time percentile (p95/p99)

## Risks and Tradeoffs

- Persisting join metadata increases responsibility to handle stale local data; mitigate with TTL and server authority.
- Decoupling connect from buy-in may increase failed join attempts for non-seated users; mitigate via explicit error handling + buy-in prompt.
- Endpoint addition introduces small backend work but removes larger transport complexity.

## Recommendation

Start with Phase 1 immediately. It aligns with existing server behavior and addresses the main reload fragility without protocol-breaking changes.

Then complete Phase 2 before feature expansion on multitable UX.

Phase 3 is the cleanup pass that should be scheduled once reconnect telemetry confirms the remaining edge cases.
