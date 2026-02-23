# Player Sessions: Current Design and Upgrade Plan

Date: 2026-02-15  
Project: `poker-engine-poc`

## Goal

Document the current player session lifecycle (auth, join, disconnect, reconnect, ban) and define the concrete improvements needed for production-safe behavior.

## Locked Decisions (Implemented Target)

1. Canonical in-room identity: `userId` is the seat owner key for cash games.
2. Transport identity: `client.sessionId` is an ephemeral connection handle only.
3. Reconnect grace window: 60 seconds.
4. During grace: keep seat + stack, mark `connected=false`, server continues turn progression.
5. Grace expiry: mark `ABANDONED`; if in-hand, fold/resolve safely; release seat at hand end.
6. Ban propagation SLA: remove banned users from active rooms within 5 seconds via session revocation + room kicks.

## Current Implementation Map

### Identity and room state

- Room player map is keyed by `userId` (not `client.sessionId`).
  - `src/engine/Dealer.ts`
  - `src/state/PokerState.ts`
- `PlayerState` includes session connectivity fields.
  - `src/state/PlayerState.ts`
  - `userId`, `connected`, `disconnectDeadlineTs`, `status: "ABANDONED"`

### Auth-gated room join

- `PokerRoom.onAuth()` validates bearer token via `AuthService.validateSession`.
  - `src/rooms/PokerRoom.ts`
  - `src/engine/auth/AuthService.ts`
- Join is denied without valid auth context.
- Duplicate seat for same `userId` is blocked per table.

### Disconnect and reconnect

- `PokerRoom.onLeave(client, consented)`:
1. `consented=true`: immediate remove (`dealer.removePlayer(userId)`).
2. `consented=false`: mark disconnected, keep seat, call `allowReconnection(client, 60)`.
3. reconnect success: rebind new `sessionId` -> same `userId`, mark connected.
4. reconnect timeout: mark `ABANDONED`.
- Implemented in:
  - `src/rooms/PokerRoom.ts`
  - `src/engine/Dealer.ts`

### Abandoned policy

- `dealer.markAbandoned(userId)` sets `status="ABANDONED"`, clears action flags.
- Seat release is deferred through pending-release queue and processed at hand end.
- Side-pot / showdown logic excludes `ABANDONED` from active contenders.
  - `src/engine/rules/BettingRound.ts`
  - `src/engine/rules/SidePotManager.ts`

### Ban propagation

- `AdminService.banUser(userId)`:
1. sets `User.isBanned=true`
2. revokes all `UserSession` rows
3. emits `user.banned` event
4. calls `kickUserByAdmin` on active poker rooms via `matchMaker.remoteRoomCall(..., timeout=5000)`
- Implemented in:
  - `src/engine/auth/AdminService.ts`
  - `src/engine/auth/SessionEvents.ts`
  - `src/rooms/PokerRoom.ts`

## What Is Good Now

- Identity drift from reconnect/session changes is structurally addressed by `userId`-keyed runtime state.
- Join path is now auth-gated.
- Reconnect grace behavior exists with explicit state fields.
- Ban path includes both DB session revocation and active room kicks.

## Remaining Risks and Fixes

### P0.1 Runtime safety gaps

1. Ensure disconnected players cannot send actions from stale transports.
- Keep `userIdBySessionId` mapping strict and clear old bindings on leave/reconnect.
- Add explicit test for stale session action rejection.

2. Ensure abandoned-in-hand fold semantics are deterministic.
- Add targeted integration test where abandoned user is current `toAct`.
- Confirm street progression and no deadlock.

### P0.2 Session policy hardening

1. Add explicit table-level reconnect observability events.
- `PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED`, `PLAYER_ABANDONED`.

2. Enforce single active session policy option (configurable).
- Optional: revoke older sessions on new login if desired.

### P1 API completeness

1. Add logout endpoints:
- `/api/auth/logout`
- `/api/auth/logout-all`

2. Add bounded-time test for ban kick SLA.
- Assert active seated user is removed quickly after `banUser`.

## Must-Have Session Test Matrix

1. Join rejects without token.
2. Join rejects banned/expired token.
3. Drop + reconnect within 60s restores same seat/stack/userId.
4. Drop + no reconnect marks `ABANDONED` and seat is released at hand end.
5. Ban invalidates sessions and kicks active seated user.
6. Stale/disconnected transport cannot submit valid actions.

## Acceptance Criteria

1. Canonical in-room identity is `userId` everywhere in dealer/room state.
2. Reconnect inside 60s fully restores prior seat identity.
3. Reconnect timeout cannot reclaim stale seat state.
4. Ban path removes active user from room within configured timeout.
5. Session tests pass in CI (`npm run test:run`).
