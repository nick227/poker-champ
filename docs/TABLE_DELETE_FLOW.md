# Table Delete Flow (Lobby → Table List → Delete)

## Flow map

1. **Lobby** (`apps/client/app/lobby.tsx`)
   - Renders `GameTableRow` per table with `onDelete={handleDeleteTable}` and `currentUserId={profile.userId}`.
   - `handleDeleteTable(tableId)` calls `confirmDeleteTable(tableId, { onSuccess: refresh + closeTable + clearTable })`.

2. **GameTableRow** (`apps/client/src/components/domain/lobby/GameTableRow.tsx`)
   - Shows Delete only when: `onDelete` set, `currentUserId` set, `table.creatorId === currentUserId`, `(table.humanCount ?? table.players) === 0`.
   - Delete control: `ConfirmButton` "Delete" with `onPress={() => onDelete(table.id)}`.

3. **confirmDeleteTable** (`apps/client/src/lib/deleteTable.ts`)
   - Shows confirmation (Alert or web fallback), then calls `serviceRegistry.post.deleteTable(tableId)`.
   - On success: runs `onSuccess`, toast "Table deleted". On failure: toast error.

4. **API** (`serviceRegistry.post.deleteTable` → SDK `lobby.deleteTable(tableId)` → `DELETE /api/lobby/tables/:tableId`)
   - Backend: `LobbyRouter` DELETE handler, `requireAuth`, resolves room by tableId, checks `metadata.creatorId === userId`, `metadata.humanCount === 0`, then `matchMaker.remoteRoomCall(roomId, "requestDisconnect")`, then pushes lobby table list update, returns 204.

5. **Table list data**
   - **HTTP**: `getLobbyTables()` → GET `/api/lobby/tables` → backend returns `creatorId`, `humanCount` per table.
   - **Realtime**: Lobby room `LIST_TABLES` → `queryTables()` returns same shape with `creatorId`, `humanCount`. Client stores in lobby store; rows are normalized with `normalizeTable()`.

## Problems identified

| Problem | Cause | Fix |
|--------|--------|-----|
| **Clicking Delete has no response** | On web, `Alert.alert()` (react-native) does not show a modal; the confirmation never appears so the user sees nothing. | Use `window.confirm()` on web and keep `Alert.alert()` on native. (Applied in `deleteTable.ts`.) |
| **Delete button not on all creator tables** | Suspected: `creatorId` or `user.id` from API sometimes number vs string, or tables from different sources (HTTP vs realtime) with different shape. A previous fix that normalized both to string and required `creatorId != null` removed the button from all tables (regression). | Reverted visibility changes. Only the web confirmation fix is kept. To fix “some tables missing” without regressing: verify backend always sends `creatorId` (string) and auth/me returns `user.id` (string); optionally compare with `String(creatorId) === String(currentUserId)` in the row only, without changing normalizer or profile. |

## Dependency summary

- **Visibility**: Backend must send `creatorId` and `humanCount` (GET tables + realtime TABLE_LIST). Both LobbyRouter and LobbyRoom do.
- **Auth**: `profile.userId` must be set (auth/me returns `user.id`). Normalize to string.
- **Confirmation**: Must work on web (use `window.confirm`) and native (`Alert.alert`).

---

## Long-term correct solution

**Principle**: One source of truth for IDs. Backend guarantees string; client normalizes at the boundary; row uses strict equality.

### 1. Backend: guarantee creatorId as string in API

- When setting: pass `creatorId: user?.id != null ? String(user.id) : undefined` into `buildTableConfig` (LobbyRouter POST). In PokerRoom `setMetadata`, set `creatorId: cfg?.creatorId != null ? String(cfg.creatorId) : undefined`.
- When exposing: GET `/tables` and LobbyRoom `queryTables` use `creatorId: metadata.creatorId != null ? String(metadata.creatorId) : undefined` so responses always send string or undefined.

### 2. Client: normalize at the boundary only

- **lobbyTables.ts**: Accept string (keep if non-empty) or number (coerce to string). Do not drop valid strings.  
  `creatorId: typeof t.creatorId === "string" && t.creatorId.length > 0 ? t.creatorId : (typeof t.creatorId === "number" ? String(t.creatorId) : undefined)`
- **useProfile.ts**: Same for `user.id`: string keep, number coerce to string.
- **GameTableRow**: No change. After normalization both sides are string; keep `table.creatorId === currentUserId`.

### 3. Confirmation UX

- Current: web `window.confirm()`, native `Alert.alert()`.
- Long-term: shared `ConfirmModal` component on all platforms for consistent UX and accessibility.
