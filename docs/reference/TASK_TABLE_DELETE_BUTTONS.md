# Task list: Table delete buttons (creator-only, empty of humans)

## Summary

- **Visibility**: Delete button shown only to the user who created the table.
- **Availability**: Delete allowed only when the table has no human players (bots-only or empty).
- **Places**: Lobby table list and optionally the table screen (e.g. table menu/top bar).

---

## 1. Backend: Store and expose table creator

- **1.1** Add `creatorId?: string` to table config and room metadata.
  - In `TableConfig` (e.g. `src/lobby/types.ts`, `TableManager` input) and in `PokerRoomMetadata` in `PokerRoom.ts`.
- **1.2** Set creator when creating a table.
  - **HTTP**: In `LobbyRouter` POST `/tables`, read `userId` from `requireAuth` (e.g. `req.user.id`), pass to `buildTableConfig` and into `matchMaker.createRoom(..., { tableConfig: { ...config, creatorId } })`.
  - **Lobby room**: In `LobbyRoom` CREATE_TABLE handler, if the client has auth (e.g. session/userId), pass `creatorId` into `buildTableConfig` and room options; otherwise leave `creatorId` unset (or skip for unauthenticated create).
- **1.3** Persist creator in room metadata.
  - In `PokerRoom.onCreate`, set `creatorId` from `options?.tableConfig?.creatorId` in `setMetadata(...)`.
- **1.4** Expose creator in table list API.
  - In `LobbyRouter` GET `/tables` and in `LobbyRoom.queryTables()`, include `creatorId` in each table object (from room metadata) so the client can compare to current user.

---

## 2. Backend: Expose “human player count” for tables

- **2.1** Add `humanCount` (or equivalent) to room metadata.
  - In `PokerRoom`, compute human count from `this.state.playersById` (e.g. count where `player.kind !== "BOT"`). Expose via metadata so lobby/HTTP can read it without joining the room.
- **2.2** Update metadata when occupancy changes.
  - After any join/leave, add/remove bot, or restore: recompute human count and call `setMetadata({ ...this.metadata, humanCount })`. Reuse a single helper (e.g. `updateHumanCountMetadata()`) and call it from the relevant code paths (e.g. after dealer add/remove player and after seat restore).
- **2.3** Include human count in table list responses.
  - In GET `/tables` and in `LobbyRoom.queryTables()`, add `humanCount` (from room metadata) to each table so the client can enable/disable the delete button.

---

## 3. Backend: Delete-table endpoint and room shutdown

- **3.1** Add HTTP endpoint to delete (close) a table.
  - e.g. `DELETE /tables/:tableId` or `POST /tables/:tableId/delete`. Use `requireAuth`.
- **3.2** Implement authorization and preconditions.
  - Resolve room by `tableId` (matchMaker.query by name `"poker"` and filter by metadata.tableId, or use a dedicated lookup).
  - If room not found, return 404.
  - If `metadata.creatorId` is set and not equal to current user id, return 403.
  - If `metadata.humanCount !== 0`, return 409 (or 400) with a clear message (e.g. “Table can only be deleted when no human players are seated”).
- **3.3** Shut down the room.
  - Call `room.disconnect()` (or Colyseus equivalent to close the room). If using another process, use `matchMaker.remoteRoomCall(roomId, 'disconnect', [])` if the room exposes a disconnect RPC; otherwise ensure the delete endpoint runs in the same process that owns the room so it can call `room.disconnect()`.
- **3.4** Optionally notify lobby.
  - After closing the room, trigger a lobby table-list refresh (e.g. same pattern as after POST `/tables`: `pushTableListUpdate` on lobby rooms) so open lobby clients see the table removed.

---

## 4. Client: Lobby table row and API types

- **4.1** Extend lobby table type and normalizer.
  - In `LobbyTableRow` (e.g. `apps/client/src/lib/lobbyTables.ts`), add `creatorId?: string` and `humanCount?: number`. In `normalizeTable()`, map these from the API response.
- **4.2** Ensure current user id is available in the lobby.
  - Use existing auth/store (e.g. `useProfile` or auth store) so the lobby can compare `table.creatorId === currentUserId`.

---

## 5. Client: Delete button in lobby

- **5.1** Show delete control only when allowed.
  - In `GameTableRow` (or parent that renders each row), show a “Delete table” (or trash) button only when:
    - `table.creatorId` is defined and `table.creatorId === currentUserId`, and
    - `(table.humanCount ?? table.players ?? 0) === 0`.
- **5.2** Wire delete to API.
  - On confirm, call the new delete endpoint (e.g. `DELETE /tables/:tableId`). On success, refresh lobby table list, clear the table from client state (closeTable, clearTable), and show a success toast. The client uses a shared confirmDeleteTable() helper (apps/client/src/lib/deleteTable.ts) for the confirmation dialog and API call. On 403/409, show the error message (e.g. “Not the creator” / “Table must be empty of human players”).

---

## 6. Client (optional): Delete from table screen

- **6.1** Add delete entry on the table screen.
  - In the table page (e.g. `apps/client/app/table/[id].tsx`) or in a table menu/settings (e.g. top bar or overflow menu), add a “Delete table” action.
- **6.2** Apply same visibility and availability rules.
  - Show the action only if the current user is the table creator and the table has no human players. Use table snapshot (e.g. count seats where `!seat.isBot`) and/or a `creatorId` / `humanCount` field if the snapshot or a small table-info API exposes them for the current table.
- **6.3** Call delete API and navigate.
  - On confirm, call the delete endpoint; on success, close the table in the multitable store and navigate back to lobby (or home).

---

## 7. Cleanup and edge cases

- **7.1** Tables created before this feature have no `creatorId`. The client does not show the delete button (creatorId is undefined). The API returns 403 for delete requests when `creatorId` is missing, so legacy tables cannot be deleted by anyone.
- **7.2** If the lobby creates tables without auth (e.g. guest CREATE_TABLE), leave `creatorId` unset so delete is not offered for those tables.
- **7.3** Consider idempotency: if the table is already closed, the delete endpoint can return 204 or 404 after verifying the requester would have been allowed (optional).

---

## Dependency order

1. Backend: 1.1 → 1.2 → 1.3 → 1.4 (creator storage and exposure).
2. Backend: 2.1 → 2.2 → 2.3 (human count in metadata and API).
3. Backend: 3.1 → 3.2 → 3.3 → 3.4 (delete endpoint and shutdown).
4. Client: 4.1 → 4.2 (types and auth).
5. Client: 5.1 → 5.2 (lobby delete button).
6. Client: 6.x optional (table-screen delete).
