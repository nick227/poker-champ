# Game Flow And Rejoin Health Review

Date: 2026-05-22

Scope: client lobby/table navigation, table realtime connection, server poker room join/leave/message handling, dealer action progression, tournament table provisioning, page reload rejoin, and lobby Join Table rejoin.

## Executive Summary

The game has several robust pieces already: server-side persistent seat restore, Colyseus reconnect tokens, session rebinding, snapshot sequence guards, action idempotency, and a stall monitor. The fragility appears in the gaps between those pieces.

The most important systemic issue is that the client treats "connected to a room" and "healthy table state recovered" as loosely coupled events. The table route can remain in `connecting` forever because `TableSceneRouter` only leaves the loading/status path when a snapshot exists, and there is no client-side timeout, rejoin/recovery state machine, or server-backed "recover my table" endpoint for cash tables. Tournament rejoin has an `ensure-table` endpoint, but it is only used before route navigation from tournament CTA paths, not as a general recovery path after the table route is already stuck.

The major improvement areas are:

1. Add an explicit client table loading/recovery state machine with timeouts.
2. Add authoritative server rejoin/resume endpoints for cash and tournament tables.
3. Make lobby Join Table resolve room/table readiness before navigating, or give the table page the same recovery ability.
4. Make server gameplay health active, not passive: table room should emit health/recovery status and force snapshots when needed.
5. Improve action lifecycle acknowledgements so the client can distinguish accepted, rejected, duplicate, resolved, and stale actions.
6. Unify tournament table lifecycle ownership so `tournament.status`, `tableId`, `roomId`, `tableLive`, room metadata, and player seat state cannot drift without repair.

## Current Flow: Cash Lobby Join Table

Client lobby cash table join is optimistic:

- The lobby row opens a buy-in modal.
- On apply, `client/app/lobby.tsx` calls `openTable(targetTableId, { buyInCents })` and immediately routes to `tablePath(targetTableId, { buyInCents })`.
- It does not ask the lobby room for fresh `TABLE_JOIN_INFO` before navigation.

Reference:

- `client/app/lobby.tsx:217-225`

Once on the table route:

- `useOpenTableSync` ensures the table is in the local multitable store, optionally with route buy-in.
- `useTableConnection` chooses a realtime room id using persisted `roomId`, lobby table `roomId`, or falls back to `tableId`.
- `useRealtimeChannel` joins by that id.

References:

- `client/src/features/table/components/table/hooks/useOpenTableSync.ts`
- `client/src/features/table/components/table/hooks/useTableConnection.ts:32-45`
- `client/src/realtime/transport.ts:314-353`

There is pre-join room id recovery when `roomId === tableId`: transport attempts to resolve a real room id by table id before joining. This is good, but it is still a best-effort fallback inside the transport layer. If room-id recovery fails, the client continues toward `joinById(activeRoomId)` using the table id, which can fail at the transport/matchmaker layer before a useful table snapshot or table-domain error is available.

Reference:

- `client/src/realtime/transport.ts:314-334`

## Current Flow: Tournament Join From Lobby

Tournament join is more deliberate than cash table join:

- `executeTournamentTableJoin` calls `postTournamentEnsureTable` when a tournament does not have a table target.
- `confirmTournamentTableJoin` persists `{ tableId, roomId }`, opens the table with starting stack, and navigates.

References:

- `client/src/lib/tournament.actions.ts:24-59`
- `server/src/http/TournamentsRouter.ts:187-222`
- `server/src/tournaments/TournamentDirector.ts:548-572`

This is the right shape. However, it is only used from tournament CTA flows. If the user is already routed to the table and the table cannot produce a snapshot, the client has no equivalent "ensure/recover this table" call from the table page. Also, if a tournament has stale `roomId` or a dead room, `ensureTournamentTableForJoin` must do the right thing every time. The director has background recovery for `STARTING` and `LATE_REG`, but `RUNNING` dead rooms are treated differently.

References:

- `server/src/tournaments/TournamentDirector.ts:321-380`
- `server/src/tournaments/TournamentDirector.ts:47-66`

Important risk: `reconcileOrphanRunningTournaments` marks `STARTING`/`RUNNING` tournaments with dead rooms as `FINISHED`, rather than recreating or producing a user-facing recovery target. That may be appropriate for old/orphan events, but it can turn transient room loss into a terminal tournament state.

Reference:

- `server/src/tournaments/TournamentDirector.ts:47-66`

## Current Flow: Page Reload / Reconnect

There are two different rejoin paths:

1. Colyseus reconnect token path:
   - `transport.ts` captures a reconnection token after successful join.
   - On disconnect, it tries `client.reconnect(reconnectionToken)`.

2. Normal join restore path:
   - Joining the room again with the same user id checks `dealer.hasPlayer(userId)`.
   - If present, server rebinds the client, marks reconnected, clears sitting out, sends `SESSION_RESTORED`, and emits snapshots.
   - If not present but persistent seats are enabled, server attempts `TableSeatSessionService.findRejoinableSession` and restores the player from persisted session.

References:

- `client/src/realtime/transport.ts:347-384`
- `server/src/rooms/room/PokerRoomJoinService.ts:94-139`
- `server/src/rooms/room/PokerRoomJoinService.ts:143-181`

Server leave handling preserves a disconnected player:

- Non-consented leave marks player disconnected.
- Persistent seats are marked sitting out.
- `allowReconnection` waits for reconnect.
- If reconnect expires and persistent seats are enabled, the seat is preserved instead of abandoned.

Reference:

- `server/src/rooms/room/PokerRoomLeaveService.ts:84-175`

This is a strong foundation. The fragility is that the table page still depends on successfully finding and joining the correct room before any of this restoration logic runs. If the client has a stale room id, no room id, a dead tournament room, or a room that joins but does not emit a snapshot, the user gets stuck before the restore logic can help.

## Current Flow: Table Loading UI

`resolveTableSceneMode` returns `connecting` whenever auth is ready but no snapshot exists. `TableSceneRouter` then shows status/loading UI whenever the mode is `connecting` or when an active/idle mode has no snapshot.

References:

- `client/src/features/table/components/table/tableScene.orchestration.ts`
- `client/src/features/table-page/TableSceneRouter.tsx:153-181`

There is no loading phase timeout in `TableSceneRouter`. If realtime connects but no `TABLE_SNAPSHOT` is accepted into the store, the user can stay in loading forever. This matches the reported lobby Join Table hang.

The snapshot store itself drops snapshots with non-increasing sequence numbers, except for a stream restart case. `SESSION_RESTORED` resets the snapshot stream. `WELCOME` only resets for `joinMode: "NEW"`.

References:

- `client/src/realtime/tableRealtime.message.ts:61-83`
- `client/src/features/table/stores/table.store.ts:58-105`

This is reasonable, but it means missed `SESSION_RESTORED`, wrong `joinMode`, stale sequence metadata, or a snapshot emitted before the handler is attached can all leave the route waiting.

## Current Flow: Player Actions

Client sends action through `dispatchTableAction`, stores pending action by table id, and waits for a resolving snapshot or error. Pending action can be cleared by matching `resolvedActionId`, or by street change if `dispatchHandStreet` is set.

Reference:

- `client/src/realtime/tableRealtime.message.ts:32-50`

Server action path:

- Message router validates action and hand id.
- Dealer action orchestrator queues actions.
- Accepted actions set `resolvedActionId`.
- Every accepted action should emit a snapshot before further progression.
- Hand finish, street complete, and turn advanced request progression drives.

References:

- `server/src/rooms/room/PokerRoomMessageRouter.ts:235-315`
- `server/src/engine/dealer/orchestration/DealerActionOrchestrator.ts:309-385`

This design is good. The weakness is around negative paths and stalled positive paths:

- Some stale-session cases return without sending an error to the client.
- Duplicate retry can be silently ignored.
- If action acceptance or progression gets stuck after queueing, the client only knows "pending" until an error/snapshot arrives.
- The server stall monitor exists, but client pending-action UX is not tied to server health or action ack stages.

## Current Flow: Server Gameplay Health

PokerRoom has a stall monitor:

- Between-hand stall recovery checks `WAITING`, ready players, due next hand, and snapshot silence, then calls `recoverBetweenHandsPublic`.
- Active-hand stall detection logs `TABLE_STALLED` and can redrive bot action/recovery after snapshot silence.

Reference:

- `server/src/rooms/PokerRoom.ts:535-650`

This is helpful but reactive and mostly log/re-drive oriented. It does not emit a client-visible table health message, nor does it guarantee a fresh snapshot to a newly rejoined client if no gameplay transition is happening.

## Primary Fragility Areas

### 1. No Table Loading Watchdog

The client has no "waiting for room", "waiting for welcome", "waiting for snapshot", or "recovery failed" timeout. All of these collapse into `connecting`.

Observed impact:

- Join Table from lobby can hang forever if the route cannot get a valid snapshot.
- Users do not get a retry/recover CTA.
- Diagnostics are mostly console logs, not UI-visible or structured by phase.

Recommended fix:

- Add a table connection state machine:
  - `auth`
  - `resolving_table`
  - `joining_room`
  - `waiting_welcome`
  - `waiting_snapshot`
  - `restoring_session`
  - `recovering_table`
  - `ready`
  - `failed`
- Add phase timers. Example: if `waiting_snapshot > 8s`, show a recovery panel with Retry, Rejoin/Recover, Back to Lobby, and dev diagnostics.

### 2. Lobby Cash Join Navigates Before Resolving Room Freshness

Cash lobby join navigates with table id and buy-in; it relies on persisted room id or preflight room-id recovery later.

Recommended fix:

- Add a REST endpoint or SDK method: `POST /api/lobby/tables/:tableId/resolve-join`.
- Return `{ tableId, roomId, status, minBuyInCents, maxBuyInCents, canJoin, reason }`.
- Have lobby Join Table call this before navigation.
- Also let the table page call the same endpoint when stuck.

### 3. Rejoin Requires Room Join, But Room Join Requires Correct Room

Server restoration is strong once the client is in the correct room. The weak point is before the room join.

Recommended fix:

- Add an authoritative table resume endpoint:
  - Cash: `POST /api/tables/:tableId/resume`
  - Tournament: `POST /api/tournaments/:id/resume-table` or extend `ensure-table`
- Response should be explicit:

```json
{
  "status": "READY",
  "tableId": "table_...",
  "roomId": "room_...",
  "mode": "PLAYER",
  "buyInCents": 10000,
  "message": null
}
```

Other statuses:

- `CREATING_ROOM`
- `ROOM_RECOVERED`
- `SPECTATOR`
- `ENDED`
- `NOT_SEATED`
- `NEEDS_BUY_IN`
- `FAILED`

### 4. Tournament RUNNING Room Death Is Too Terminal

The director can recreate dead rooms for `STARTING`/`LATE_REG`, but `STARTING`/`RUNNING` orphan reconciliation can mark tournaments finished. There needs to be a distinction between:

- legitimately completed tournament,
- abandoned old tournament,
- transient room loss,
- recoverable room loss with persisted tournament seats/stacks.

Recommended fix:

- Add a `RECOVERING` or recovery attempt path before `FINISHED`.
- Keep `finishedAt` only for confirmed result processing.
- For recent `RUNNING` tournaments with registrations and no final standings, attempt room recreation from persistent table/tournament state.

### 5. Join/Rejoin Message Handlers Are Not Symmetric

Initial room join restores existing/persisted seats. In-room `REJOIN` only toggles sitting out for an already-bound seated user. In-room `JOIN_TABLE` is for adding a new cash-game player and explicitly rejects already seated users.

References:

- `server/src/rooms/room/PokerRoomMessageRouter.ts:347-397`
- `server/src/rooms/room/PokerRoomMessageRouter.ts:400-464`

Recommended fix:

- Rename concepts in the client:
  - "Reconnect transport" for socket reconnect.
  - "Resume seat" for server-bound seat restore.
  - "Join table" for new buy-in only.
- Add a single server-side `RESUME_SEAT` room message or REST endpoint that can:
  - restore bound player,
  - restore persisted player,
  - clear sitting out,
  - emit a user-targeted snapshot,
  - return structured status/error.

### 6. Snapshot Health Is Implicit

The client considers a snapshot enough to clear errors, but there is no explicit "snapshot freshness" or "server health" model.

Recommended fix:

- Include a `tableHealth` block in snapshots:

```ts
tableHealth: {
  phase: "WAITING_FOR_PLAYERS" | "BETWEEN_HANDS" | "AWAITING_ACTION" | "RUNOUT" | "RECOVERING" | "ENDED";
  serverTimeTs: number;
  lastActionId?: string;
  resolvedActionId?: string;
  nextExpectedSnapshotByTs?: number;
  rejoinable: boolean;
  recoveryHint?: string;
}
```

This lets the client detect stale state and display precise copy.

### 7. Pending Actions Need An Ack Layer

Current action pending clears on resolved snapshot or generic error. There is no separate accepted ack.

Recommended fix:

- Server emits `ACTION_ACK` immediately after validation/queue accept:

```json
{ "actionId": "...", "status": "QUEUED" | "ACCEPTED" | "REJECTED" | "DUPLICATE" }
```

- Client pending action can move through:
  - `sending`
  - `queued`
  - `accepted_waiting_snapshot`
  - `resolved`
  - `rejected`
  - `stale_refreshing`

This avoids a UX dead zone where an action was sent but the player cannot tell whether the server accepted it.

## Recommended Workstreams

### Workstream A: Stop Infinite Loading

Priority: highest.

Deliverables:

- Client table loading state machine.
- `waiting_snapshot` timeout.
- Recovery panel with Retry, Recover Table, Back to Lobby.
- Store diagnostic fields: active room id, table id, phase, last connected ts, last snapshot ts, error.

Acceptance criteria:

- A table route cannot show loading forever.
- When room join fails or no snapshot arrives, user gets a useful recovery action.
- Dev logs include one structured event per phase transition.

### Workstream B: Authoritative Resume Endpoint

Priority: highest.

Deliverables:

- Cash table resume endpoint.
- Tournament resume endpoint or enhanced `ensure-table`.
- Server returns durable `{ tableId, roomId, role, status }`.
- Client table page invokes resume endpoint when initial connection/snapshot recovery stalls.

Acceptance criteria:

- Reloading a table page can recover after stale room id.
- Joining from lobby can recover after room recreation.
- Tournament join can distinguish player, spectator, ended, and not registered.

### Workstream C: Server Snapshot-On-Join Guarantee

Priority: high.

Deliverables:

- Every successful room join, restore, spectator join, rejoin, or resume emits a user-targeted snapshot after handlers are registered.
- Add tests for page reload and join-by-table-id paths.

Acceptance criteria:

- After successful join/restore, client receives a snapshot within a bounded time.
- If snapshot cannot be emitted, server sends structured `ERROR` with recovery status.

### Workstream D: Gameplay Progression Watchdogs

Priority: high.

Deliverables:

- Promote stall monitor from logging/redrive into health state.
- Add "force snapshot" recovery before/after redrive.
- Track hand transition deadlines:
  - action accepted -> snapshot due,
  - hand finished -> next hand due,
  - next hand due -> start or explicit waiting reason.

Acceptance criteria:

- A table stuck between hands emits a health event and either starts next hand or explains why.
- A table stuck after action emits a health event and attempts deterministic recovery.

### Workstream E: Tournament Lifecycle Repair

Priority: high.

Deliverables:

- Separate `RECOVERING` from `FINISHED`.
- Attempt recent `RUNNING` room recreation before terminal finish.
- Persist enough tournament table state to rebuild room safely.
- Make `ensure-table` safe for stale `roomId`.

Acceptance criteria:

- Recent active tournament room death does not silently become `FINISHED`.
- Lobby Join Table can recover a tournament table when possible.
- Terminal states reflect actual results/refunds, not missing infrastructure.

### Workstream F: Action Ack And Pending UX

Priority: medium.

Deliverables:

- `ACTION_ACK` server event.
- Client pending action phases.
- Pending action timeout triggers snapshot refresh/resume.

Acceptance criteria:

- Players see immediate action progress.
- Rejected/stale actions recover without trapping the action bar.
- Duplicate retry is harmless and visible in diagnostics.

## Suggested First Implementation Slice

Start with the smallest slice that turns opaque hangs into recoverable states:

1. Add table loading phase timers in `TableSceneRouter` / table page controller.
2. Add a "Still restoring table" panel after 8-10 seconds without a snapshot.
3. Add a recover action that:
   - clears local snapshot cursor for the table,
   - refreshes lobby/tournament metadata,
   - resolves a fresh room id by table id,
   - reconnects to that room.
4. Add structured logs for `table_load_phase_changed`, `table_load_timeout`, and `table_recovery_attempt`.

Then add the proper server resume endpoint and replace the client-side best-effort recovery with authoritative server recovery.

## Questions To Resolve

1. Should cash-game persistent seats survive server restart indefinitely, or only for a TTL?
2. For tournaments, should a running room be recreated after server restart, or should tournament games be terminal if the room process dies?
3. What is the desired player state after reload: immediately active if it is their turn, or sitting out until they explicitly resume?
4. Should lobby Join Table always call server resolve before routing, even for apparently healthy rows?
5. Should tournament spectators use the same table route, or a separate read-only tournament table route?

## Bottom Line

The core engine has many safety mechanisms, but the user experience is fragile because health is implicit. The table page needs bounded loading and active recovery. The server needs authoritative resume semantics that work before the client has joined the room. Tournament lifecycle needs a recoverable state between live and finished. Once these pieces exist, intermittent gameplay stalls become diagnosable and survivable instead of turning into permanent loading screens.
