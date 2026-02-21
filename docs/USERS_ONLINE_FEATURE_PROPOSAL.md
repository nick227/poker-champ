# Users Online Feature - MVP Proposal (No Hands Played)

## Goal
Add a right-aligned `X Online` link in the lobby title bar. On press, open a sheet showing online users with:
- initials avatar
- display name
- location only:
  - `Lobby`
  - `Table: {tableName}`
  - `Multi-table (N)`

No hands-played field in MVP.

## MVP Decisions
- `online now` includes any authenticated realtime connection in lobby or poker table rooms.
- Count is deduped by `userId`.
- No Prisma reads for count or sheet payload.
- No room polling / remote introspection for sheet open.

## Architecture

### 1) `PresenceIndex` (authoritative, in-memory)
Add a shared singleton service that tracks where each user is connected.

Suggested structure:
- `Map<userId, Map<locationKey, PresenceLocation>>`
- `locationKey`:
  - `LOBBY`
  - `TABLE:{tableId}`

Suggested API:
- `add(userId, location)`
- `remove(userId, location)`
- `getTotalOnline(): number`
- `getSnapshot(): PresenceSnapshot[]`
- `subscribe(fn: (totalOnline: number) => void): () => void`

This gives:
- single online count source
- multi-device safe dedupe
- multi-table detection
- event-driven count broadcasts (no drift-prone manual triggers)

### 2) Rooms publish presence events

#### LobbyRoom
- Always require auth before presence writes:
  - `if (!client.auth?.userId) return;`
- `onJoin`: `presenceIndex.add(userId, { kind: "LOBBY" })`
- `onLeave`: `presenceIndex.remove(userId, { kind: "LOBBY" })`

#### PokerRoom
On human bind/unbind lifecycle:
- Always require auth before presence writes:
  - `if (!client.auth?.userId) return;`
- bind: `presenceIndex.add(userId, { kind: "TABLE", tableId, tableName })`
- unbind/leave/abandon: `presenceIndex.remove(userId, { kind: "TABLE", tableId })`

No polling. Rooms are source-of-truth publishers.

### 3) Event flow ownership (important)
- Do not let `PokerRoom` call `LobbyRoom` directly.
- Required flow:
  - `PokerRoom` / `LobbyRoom` -> `presenceIndex`
  - `presenceIndex` -> subscribers (all lobby rooms)
- Example in `LobbyRoom`:
  - subscribe on create:
    - `presenceIndex.subscribe((totalOnline) => this.broadcast("ONLINE_COUNT", { totalOnline }))`
  - unsubscribe on dispose

### 4) Lobby realtime messages

#### Header count push
Broadcast lightweight message on presence changes (debounced):
- `ONLINE_COUNT { totalOnline: number }`

#### Sheet request/response
- Client sends: `LIST_ONLINE_PLAYERS`
- Server replies: `ONLINE_PLAYERS { totalOnline, players, generatedAt }`

`players` built from `PresenceIndex.getSnapshot()` only.

Display name must be normalized once via helper:
- `resolveDisplayName(user) => user.displayName ?? user.username ?? \`Player-${user.id.slice(0,4)}\``

## Contract Changes (`packages/realtime-contract/src/lobby.ts`)

### Add inbound message
- `LIST_ONLINE_PLAYERS`

### Add outbound messages
- `ONLINE_COUNT` payload:
  - `totalOnline: number`
- `ONLINE_PLAYERS` payload:
  - `totalOnline: number`
  - `players: OnlinePlayerSummary[]`
  - `generatedAt: number`

### `OnlinePlayerSummary` (simplified)
- `userId: string`
- `displayName: string`
- `initials: string`
- `location`:
  - `kind: "LOBBY" | "TABLE" | "MULTI_TABLE"`
  - optional `tableId`, `tableName`
  - optional `tables: { tableId: string; tableName: string }[]`

Lock MVP payloads to these shapes only:
- `ONLINE_COUNT`
  - `{ totalOnline: number }`
- `ONLINE_PLAYERS`
  - `{ totalOnline: number, generatedAt: number, players: OnlinePlayerSummary[] }`

## Location Semantics
Deterministic mapping from per-user location set:
- no table locations -> `{ kind: "LOBBY" }`
- exactly 1 table -> `{ kind: "TABLE", tableId, tableName }`
- 2+ tables -> `{ kind: "MULTI_TABLE", tables: [...] }`

Presence dedupe rule:
- repeated add for same table key (`TABLE:{tableId}`) is a no-op
- (same user + same table + multiple sessions still one table location)

## Sorting
Recommended server-side sort:
1. `TABLE`
2. `MULTI_TABLE`
3. `LOBBY`
4. `displayName` ascending

## Client Changes

### 1) Lobby header
- Update `apps/client/src/components/domain/lobby/Masthead.tsx` to support right action slot.
- In `apps/client/app/lobby.tsx` render `\`${onlineTotal} Online\`` as right-aligned link.
- Press opens `ModalSheet`.

### 2) Lobby store + realtime wiring
- Extend `apps/client/src/stores/lobby.store.ts` with:
  - `onlineTotal`
  - `onlinePlayers`
  - `onlineBusy`
  - `onlineError`
- Extend lobby realtime guards/registry for:
  - `ONLINE_COUNT`
  - `ONLINE_PLAYERS`
- On sheet open, send `LIST_ONLINE_PLAYERS`.

### 3) Online users sheet
New component (e.g. `OnlinePlayersSheet.tsx`) using existing `ModalSheet`:
- initials avatar
- display name
- location text
- empty state: `No players online`

No `Hands: N` row in MVP.

## Performance Profile
- O(1) updates on join/leave.
- O(n online users) snapshot build.
- Zero DB reads for this feature.
- No `matchMaker.query`/`remoteRoomCall` for sheet open.

## Multi-device / Multi-table Behavior
- User counted once regardless of number of devices.
- Same table via multiple sessions collapses to one table location.
- Multiple table memberships produce `MULTI_TABLE`.

## Rollout Plan
1. Add `PresenceIndex` singleton + tests.
2. Wire LobbyRoom and PokerRoom presence add/remove hooks.
3. Add contract messages and lobby handlers.
4. Wire client header count + sheet UI.
5. Add integration tests for dedupe and location semantics.

## Minimal Tests
- PresenceIndex:
  - add/remove
  - dedupe
  - multi-table
- LobbyRoom:
  - join -> `ONLINE_COUNT` increments
  - leave -> `ONLINE_COUNT` decrements
- PokerRoom:
  - bind/unbind updates presence index
- Integration:
  - same user joins lobby + table -> `totalOnline = 1`
  - same user joins 2 tables -> `MULTI_TABLE`

## Out of Scope (Phase 2)
- lifetime hands played
- avatar image URLs / profile media
- search/filter in online sheet

This MVP keeps user count and location simple, realtime, and cheap.
