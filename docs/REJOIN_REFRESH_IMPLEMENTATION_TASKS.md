# Rejoin + Refresh Implementation Tasks

Date: February 16, 2026
Scope: Reliable refresh auth, durable seat persistence, and anytime rejoin by table URL.
Status: Closed (implementation complete; manual gate execution deferred by planning decision)

## Goal
Users can close/refresh browser tabs and rejoin the same table via `/table/:tableId` without losing seat/chips, while disconnected users are safely handled as sitting out.

## Epic Closure Decision
- Closure decision date: February 16, 2026
- Decision: close this epic and shift active engineering focus to `Table Snapshots + Hand History Persistence`.
- Residual release work:
  - manual two-browser checklist in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md` remains as operational validation evidence.
  - this does not block starting the next epic, but it remains recommended before broad rollout.

## Status Summary
- `Step 1` implemented + covered by tests (auth hydration race controls):
  - table route hydration/auth gating
  - `login?next=...` redirect support
  - realtime hard-stop when token is missing
  - table realtime hard-stop before `auth.hydrated === true` (socket-level gate)
  - guard test coverage in `apps/client/src/tests/useRealtimeChannel.guard.test.ts`
  - pre-hydration invariant harness coverage in `apps/client/src/tests/prehydration.invariant.harness.test.ts`
- `Step 2` implemented behind feature flag (persistent seat-session foundation):
  - `TableSeatSession` schema + indexes
  - seat session service with row-locking strategy for upsert
  - `PokerRoom` seat-session writes/updates on join/disconnect/reconnect/leave
- `Step 3` implemented (rebind + idempotent join path):
  - join serialization lock by `(tableId,userId)` key
  - persisted session restore path without rebuy when row exists and state != `LEFT`
  - repeated joins for same `(tableId,userId)` resolve deterministically
- `Step 4` implemented (auto-action + cap + persisted sit-out):
  - disconnected player auto-action on turn (`CHECK` when legal, otherwise `FOLD`)
  - consecutive auto-action cap via `AUTO_ACTION_HAND_CAP` (default `3`)
  - cap-triggered sit-out marks in-memory `ABANDONED` and persisted `SEATED_SITTING_OUT` in the same flow
- `Step 5` implemented + staged rollout pending (soft/hard TTL + sweep):
  - env-backed TTL config: `SEAT_RETENTION_HOURS`, `SEAT_HARD_DELETE_HOURS`
  - soft-expired `SEATED_SITTING_OUT` rows are marked `LEFT` + seat release/cashout flow
  - hard-expired rows are deleted from `TableSeatSession`
  - cleanup sweep is invoked during persistent-seat join handling
- `Step 6` implemented + staged rollout pending (restart recovery + version mismatch handling):
  - room boot loads restorable sessions and rebuilds in-memory seats
  - restored rows load as disconnected + sitting out
  - schema-version mismatch rows are forced-cashed-out and marked `LEFT`
- Remaining advanced items: none in current scoped plan (manual two-browser release gate still required).

Feature-flag boundary:
- When `FEATURE_PERSISTENT_SEATS=false`, all DB seat-session reads/writes, TTL sweep, and restart recovery are bypassed; only legacy in-memory behavior runs.

Join idempotency response semantics:
- Repeated join for same `(tableId,userId)` returns:
  - same seat
  - same `stackCents`
  - `joinMode: "RESTORE" | "NEW"` (response field or log field)

Historical note:
- Phase-level `Acceptance` blocks below are retained as implementation history for this now-closed epic.
- Release closure criteria are defined by `Definition of Done` + manual gate completion.

## Phase 1: Auth-Hydration Guard Finalization
1. Keep integration invariant: refresh on `/table/:tableId` with delayed token hydration does not emit table join before `auth.hydrated === true`.
2. Keep redirect invariant: no token after hydration routes to `/login?next=/table/:tableId`.
3. Keep logging assertion: zero `POKER_JOIN_ATTEMPT` before hydration complete.
4. Keep transport invariant: zero realtime socket connection attempts before `auth.hydrated === true`.
5. Keep assertion key: `SOCKET_CONNECT_ATTEMPT` count must be `0` pre-hydration.

Acceptance:
- No `"Missing Authorization bearer token."` from normal refresh flows.
- Unauthorized refresh always routes to login with `next`.
- No realtime socket connect attempts before hydration.

## Phase 2: Seat Persistence Schema
1. Keep `TableSeatSession` model and indexes:
   - by `tableId`
   - unique `(tableId, userId)`
   - by `(tableId, state)`
2. Keep transactional seat contention checks in service layer.
3. Keep row-locking strategy (`SELECT ... FOR UPDATE`) for seat assignment conflict control.

Acceptance:
- Seat session rows exist and update for join/disconnect/leave transitions.
- No duplicate active seat ownership for the same seat in one table.

## Phase 3: Server Rebind-by-Table Flow
1. Keep `tableId` canonical in join contract and server flow.
2. Keep authoritative table registry (`tableId -> roomId`) resolution.
3. On join, keep behavior:
   - authenticate by bearer token
   - resolve room by `tableId`
   - if active seat session exists, restore seat/chips with no rebuy
   - else perform first-time seat + buy-in
4. Keep fallback: `room not found` -> resolve latest by `tableId`.
5. Keep idempotency for `(tableId,userId)` with deterministic restore semantics above.

Acceptance:
- Rejoining by URL with same authenticated user returns same seat/chips.
- No forced rebuy for already seated user.

## Phase 4: Disconnect + Sit-Out Policy
1. Keep DB-backed sitting-out as primary durable behavior.
2. On websocket disconnect:
   - `connected=false`
   - seat session state=`SEATED_SITTING_OUT`
   - `disconnectAt` + `lastSeenAt` written
   - chips and seat retained
3. In-hand auto-action:
   - legal check -> `CHECK`
   - otherwise -> `FOLD`
4. Between hands, sitting-out players are skipped until reconnect.
5. Auto-action cap moves player to sitting out state with persistence mirror.

Acceptance:
- Game flow continues without deadlocks when users disconnect.
- Disconnected users do not lose seats immediately.

## Phase 5: Seat Retention TTL + Cleanup
1. Keep env controls:
   - `SEAT_RETENTION_HOURS` (soft TTL)
   - `SEAT_HARD_DELETE_HOURS` (hard TTL)
2. Keep soft/hard cleanup behavior:
   - soft-expired `SEATED_SITTING_OUT` -> force release/cashout + mark `LEFT`
   - hard-expired rows -> delete from `TableSeatSession`
3. Keep metrics/logging for forced release/cashout.

Clarification:
- TTL sweep is opportunistic (on join); optional interval job can be added later for quieter tables.

Acceptance:
- Expired inactive seats are reclaimed automatically when cleanup is triggered.
- No long-term seat leaks.

## Phase 6: Restart Recovery
1. On room bootstrap by `tableId`:
   - load non-expired `SEATED_ACTIVE/SEATED_SITTING_OUT` rows
   - validate `schemaVersion/engineVersion` compatibility
   - rebuild in-memory seats/stacks
   - mark restored players `connected=false` initially
2. Ensure first emitted snapshot reflects restored seating state.
3. On version mismatch:
   - skip restore for incompatible rows
   - force cashout and mark `LEFT`

Acceptance:
- Server restart does not erase non-expired seat ownership.
- Rejoin after restart works via same table URL.

## Testing Gates (Required)
Automated gates (implemented/required to stay green):
- [x] `apps/client/src/tests/prehydration.invariant.harness.test.ts`
- [x] `apps/client/src/tests/useRealtimeChannel.guard.test.ts`
- [x] `src/tests/table-action-broadcast.test.ts`
- [x] `apps/client/src/tests/lobbyTables.normalize.test.ts`
- [x] headless harness: `scripts/headless-two-client.ts`

Manual gate (required):
- [ ] Manual two-browser execution completed (see `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md` audit section).
- [x] Manual gate checklist template present: `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`.

Minimum manual checklist:
1. Refresh `/table/:tableId` mid-hand -> no auth error.
2. Close tab and re-open within TTL -> same seat and same stack.
3. Disconnect mid-turn -> auto-action triggers and hand progresses.
4. Exceed auto-action cap -> player is sitting out while seat is preserved.
5. Restart server -> seats restore as disconnected and rejoin succeeds.

## Rollout Plan
1. Keep `FEATURE_PERSISTENT_SEATS` off by default in production until staged validation completes.
   - Production default/config baseline: `FEATURE_PERSISTENT_SEATS=false` in prod environment configuration.
2. Validate end-to-end in staging with full automated + manual gates.
3. Enable feature in controlled rollout window.
4. Keep rollback kill switch:
   - `FEATURE_PERSISTENT_SEATS=false` reverts immediately to in-memory-only behavior.

## Definition of Done
1. Refresh on `/table/:tableId` never fails due to pre-hydration auth race.
2. User can close tab and rejoin later via URL to same seat/chips (within TTL).
3. Disconnected players are handled as sitting out and do not stall gameplay.
4. Expired seats are reclaimed automatically.
5. Automated + manual release gates pass.
6. If a player is marked sitting out in memory due to auto-action cap, persisted seat session is `SEATED_SITTING_OUT` in the same flow.
