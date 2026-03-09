# Table Loading + Table Creation Lifecycle Analysis

## Scope
This documents how `TableLoadingLanding` behaves today, what event actually transitions from loading to table view, how table/seat creation works end-to-end, and what state is ephemeral vs persisted.

## 1) What the loading screen currently does

### `TableLoadingLanding` UI behavior
- File: `apps/client/src/components/domain/table/loading/TableLoadingLanding.tsx`
- It always renders the slot machine panel immediately.
- The status text (`statusMessage`) is intentionally delayed by one spin duration (`ONE_SPIN_MS = 1500`) before appearing (`loadingUiVisible` timer).
  - `ONE_SPIN_MS`: line 28
  - delayed visibility timer: lines 72, 76
- It reports slot spin start to parent with the same fixed duration (`onSlotSpinStart(1500)`), not a measured network/server duration.
  - line 179
- There are computed action variables (`actionTitle`, `actionHandler`) that look like intended button wiring, but no button is currently rendered in JSX.
  - lines 66-67

### Router-level loading hold behavior
- File: `apps/client/src/features/table-page/TableSceneRouter.tsx`
- Even after data is ready, router can hold loading view until slot spin hold expires:
  - `shouldHoldRevealForSlotSpin`: line 173
  - `showStatusView`: line 174
  - hold duration set in `handleLoadingSlotSpinStart`: lines 177-178

## 2) What event actually triggers screen change

### Loading -> table transition trigger
The real trigger is **first valid table snapshot in store**, not slot animation completion.

- Scene mode is derived as:
  - `connecting` if no snapshot
  - `idle` if snapshot exists and no active hand
  - `active` if snapshot + active hand
  - File: `apps/client/src/components/domain/table/tableScene.orchestration.ts` lines 9-12
- Realtime inbound `TABLE_SNAPSHOT` updates store snapshot and sets connection status connected:
  - File: `apps/client/src/realtime/tableRealtime.message.ts` lines 79, 98, 135
- Snapshot presence (`hasSnapshot`) feeds `resolveTableSceneMode`, which flips out of `connecting`.

### Net: transition conditions
You leave loading when all are true:
1. auth hydrated + token available (or you are redirected to login), and
2. snapshot exists for this table, and
3. slot-hold delay (if active) has elapsed.

## 3) What we are measuring vs not measuring

### What is currently measured
- Only local UI timing:
  - `ONE_SPIN_MS` fixed 1500ms in loading component.
  - hold-until timestamp in router (`Date.now() + spinDurationMs`).

### What is not measured
- No explicit metric for:
  - server table creation duration,
  - websocket join duration,
  - time-to-first-snapshot,
  - seat restore/add-player duration,
  - reconciliation delay.

So the loading animation timing is cosmetic pacing, not backend readiness measurement.

## 4) Table creation and join lifecycle (full path)

### A) Table creation
- Lobby HTTP creates room immediately via Colyseus matchmaker:
  - `matchMaker.createRoom("poker", { tableConfig })`
  - File: `src/http/LobbyRouter.ts` lines 110, 175
- Room initialization builds Dealer/game state in `PokerRoom.onCreate`:
  - File: `src/rooms/PokerRoom.ts` line 281

### B) User navigates to table route
- In lobby join/apply flow:
  - store `openTable(...)`, then `router.push(tablePath(...))`
  - File: `apps/client/app/lobby.tsx` lines 161-162

### C) Client realtime join
- Table page controller enables realtime when auth + token + tableId:
  - File: `apps/client/src/components/domain/table/hooks/useTableConnection.ts` line 40
- Realtime session then `joinById(roomId, joinOptions)` (or reconnect path):
  - File: `apps/client/src/realtime/transport.ts` lines 300-301

### D) Server join handling
- `PokerRoom.onJoin` delegates to join service:
  - File: `src/rooms/PokerRoom.ts` line 618
- Join service behavior:
  - If same user already seated: restore/rebind session (`SESSION_RESTORED`) and emit snapshots.
    - `src/rooms/room/PokerRoomJoinService.ts` lines 71, 114-115
  - Else validates join options and `dealer.addPlayer(...)`, sends `WELCOME`, emits snapshots.
    - lines 211, 229, 236

## 5) Are we setting up game state on server memory?
Yes.

- `PokerRoom` + `Dealer` are authoritative in-memory game runtime for each room.
- Room persists while alive (autoDispose disabled):
  - `autoDispose = false`
  - File: `src/rooms/PokerRoom.ts` line 168

Also, optional persistence exists for seat/session recovery (if feature flag enabled):
- `FEATURE_PERSISTENT_SEATS === "true"`
- File: `src/config/features.ts` lines 1-2
- Seat session state is stored via `TableSeatSessionService` (`SEATED_ACTIVE`, `SEATED_SITTING_OUT`, `LEFT`).

## 6) If user waits long before pressing hypothetical Continue, does state go stale?
Short answer: generally **no**, if continue only gates UI reveal.

- If websocket is already connected, server table stays live and snapshots continue.
- Delaying UI reveal does not pause game progression; when user continues, they should see latest snapshot state.

Potential risks by design choice:
- If continue delays **joining websocket** itself, then user is not connected yet and not seated/restored yet.
- If room is empty long enough, server idle-dispose can delete it:
  - empty grace default 60s: `EMPTY_GRACE_MS` line 254
  - idle dispose default 30m: `IDLE_DISPOSE_MS` line 260
  - disposal path `requestDisconnect()`: lines 1541, 1550

Reconnection window for accidental disconnect is large (minimum 20 minutes):
- `MIN_RECONNECT_TIMEOUT_MS = 20 * 60_000`
- File: `src/rooms/PokerRoom.ts` line 53

## 7) How table stays active
A table stays active while at least one connected client is present.

- Empty-state tracking:
  - `handleEmptyStateChange()` starts timer only when client count hits zero.
  - File: `src/rooms/PokerRoom.ts` around lines 1501-1520
- With connected players, idle timer is cleared.
- On disconnect, player can be restored via `allowReconnection(...)` in leave service.
  - File: `src/rooms/room/PokerRoomLeaveService.ts` line 140

## 8) Can we add a Continue button to loading?
Yes, but choose the gating point deliberately.

### Safe approach (recommended)
- Keep realtime join + snapshot ingestion exactly as-is.
- Add `continue` UI that only controls reveal of `EmptyTableView`/`ActiveTableView` once snapshot is ready.
- This avoids staleness and keeps current server lifecycle intact.

### Riskier approach
- If continue delays realtime join or server seat creation, you introduce failure modes:
  - room may be deleted while waiting,
  - auth/session may change,
  - buy-in/join context may drift.

## 9) WebSocket / Realtime connection management details

### Is a new WS connection created when table becomes ready?
- Usually no.
- The same table realtime session established during `connecting` continues into `idle/active`.
- Readiness is driven by incoming `TABLE_SNAPSHOT`; it does not itself open another socket.

### What currently creates/recreates a table realtime session
- Realtime starts only when table scope is enabled, auth is hydrated, token exists, and tableId is present.
  - `apps/client/src/realtime/useRealtimeChannel.ts`
  - `apps/client/src/components/domain/table/hooks/useTableConnection.ts`
- Session creation is keyed by `scope`, `id` (roomId/tableId), `enabled`, `authHydrated`, `joinOptions`.
  - Changing those inputs can recreate the underlying session.
- Transport uses Colyseus by default, and joins table rooms via `joinById(roomId, joinOptions)`.
  - `apps/client/src/realtime/transport.ts`
  - `apps/client/src/registry/transport.registry.ts`

### Current multi-table connection policy
- On mounting a table realtime hook, client disconnects other table connections to keep one active table connection:
  - `storeRegistry.tables().disconnectOtherTables(tableId)`
  - `apps/client/src/realtime/useTableRealtime.ts`
- This is an intentional guard against black-screen/race behavior during rapid table switches.

### Reconnect/session behavior
- On leave/error, client emits `RECONNECTING` and retries (bounded by retry limits).
- Session replacement path uses a dedicated close code (`4001`) so stale sessions are not treated as normal user leaves.
- `DISCONNECTED` from stale sessions is ignored via sessionId scoping in table message handling.
  - `apps/client/src/realtime/transport.ts`
  - `apps/client/src/realtime/tableRealtime.message.ts`

## Bottom line
- The loading-to-table screen change is snapshot-driven, with optional animation hold.
- Current timing is cosmetic, not backend-readiness measurement.
- Server game state is real and in-memory per room (with optional persistent seat recovery).
- A Continue button is feasible and safest as a UI reveal gate after snapshot readiness, not as a delayed join trigger.
