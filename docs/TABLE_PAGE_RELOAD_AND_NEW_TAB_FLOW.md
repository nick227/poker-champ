# Table page: reload and new-tab event flow

This describes the sequence of events when a user **reloads** the page at the game URL or **closes the tab and opens the game URL in a new tab** (e.g. `http://localhost:8081/table/table_CfJ0WcgJ8c?buyInCents=20000`). Both cases are a **cold load**: new JS context, no in-memory state.

---

## 1. Browser loads the URL

- Document loads at `/table/table_XXX?buyInCents=20000`.
- Expo Router matches `app/table/[id].tsx`; the segment `table_XXX` is `id`, and the query is `buyInCents=20000`.
- No redirect via index: index only runs when path is `/`.

---

## 2. React tree mounts

- **Root layout** (`_layout.tsx`): mounts, runs `useEffect` → `bootstrapSdk()` starts (async).
- **Stack** renders the matched screen: **TableScreen** (`table/[id].tsx`) mounts.
- **Stores** are fresh (no persist for multitable/table/lobby):
  - **auth**: `token: null`, `hydrated: false` until bootstrap finishes.
  - **multitable**: `openTableIds: []`, `tableJoinById: {}`, `activeTableId: null`.
  - **table**: `snapshotsByTableId: {}`, `connectionStatusByTableId: {}`, `errorByTableId: {}`.
  - **lobby**: `tables: []`.

---

## 3. First render of TableScreen

- **Route params**: `useLocalSearchParams()` may still return `buyInCents: undefined` on web on first paint (Expo Router can lag). So we fall back to **URL**: `routeBuyInCents = parse(window.location.search).buyInCents` → e.g. `20000`.
- **Derived**:
  - `tableId` = `"table_XXX"` (from `id` param).
  - `joinState` = `undefined` (no entry in `tableJoinById`).
  - `routeBuyInCents` = `20000` (from URL fallback).
  - `buyInCents` = `routeBuyInCents ?? joinState ?? lobby min` → `20000`.
  - `hasValidBuyIn` = true.
  - `snapshot` = undefined (table store empty).
  - `shouldConnectRealtime` = `Boolean(snapshot) || hasValidBuyIn` → true.
  - `authHydrated` = false → **TableScreen** can show “Restoring session...” and **realtime is not started** until auth is hydrated.

---

## 4. Bootstrap (runs in parallel with step 3)

- `bootstrapSdk()`:
  1. `setApiBaseUrl`, subscribe auth store → SDK.
  2. `await storeRegistry.auth().hydrateToken()` → on web reads `localStorage` for token, sets `auth.token` and `setAuthToken(token)`.
  3. If token exists: `await auth.me()`; on failure calls `logout()`.
  4. `storeRegistry.auth().markHydrated()` → `auth.hydrated = true`.

When bootstrap completes, auth store updates → re-render.

---

## 5. After auth hydrates

- **If no token (or logout)**: effect in TableScreen runs → `router.replace(loginPathWithNext(tableNextPath))` (table URL stored as `next`).
- **If token present**:
  - `canConnectWithAuth` = true.
  - **open-table effect** (tableId, routeBuyInCents, joinState, …): `openTableIds` does not contain `tableId` → `openTable(tableId, { buyInCents: routeBuyInCents })` runs → multitable store: `openTableIds = [tableId]`, `activeTableId = tableId`, `tableJoinById[tableId] = { buyInCents: 20000 }`.
  - **Lobby effect**: `tableId` set and `lobbyTables.length === 0` → `storeRegistry.lobby().refresh()` → HTTP fetch for lobby list, then `lobby.tables` populated (async).
  - **useTableRealtime**:
    - `enabled` = `shouldConnectRealtime && canConnectWithAuth` = true.
    - `joinOptions` = `{ tableId, buyInCents: 20000 }` (because `hasValidBuyIn`).
    - **useRealtimeChannel** runs its effect: `canStartRealtimeSession(...)` true → `resolveRealtimeTransportConfig` (e.g. Colyseus) → `createRealtimeSession` with `roomId: realtimeRoomId` (tableId or resolved from lobby later) and `joinOptions`.
  - **Colyseus**: `client.joinById(roomId, { tableId, buyInCents: 20000, token })` (or joinOrCreate with same options). Server receives join with buy-in and can re-seat the user; it sends **TABLE_SNAPSHOT** (and possibly WELCOME / SESSION_RESTORED).
  - **On TABLE_SNAPSHOT**: `dispatchRealtimeChannelMessage` → table store `setSnapshot(tableId, snapshot)` → `snapshotsByTableId[tableId]` set → TableScreen re-renders with `snapshot` → UI switches from **ConnectingTableShell** to **EmptyTableView** or **TableLayout** (depending on `snapshot.hand`).

---

## 6. Ordering and timing (cold load)

| Step | What |
|------|------|
| 1 | URL loaded, TableScreen mounted, stores empty. |
| 2 | First render: `routeBuyInCents` from URL fallback; `hasValidBuyIn` true; no snapshot; auth not hydrated → “Restoring session...” and no realtime. |
| 3 | Bootstrap finishes: token from localStorage (or null), `auth.markHydrated()`. |
| 4 | Re-render: if no token → redirect to login with `next=/table/...?buyInCents=20000`. If token → open-table effect runs, lobby refresh starts, useTableRealtime effect runs. |
| 5 | Realtime session created with `joinOptions: { tableId, buyInCents }`. |
| 6 | Colyseus join; server sends TABLE_SNAPSHOT; table store gets snapshot; UI shows table. |

---

## 7. Why “Missing buy-in data” used to appear (before URL fallback)

- **Without** reading `buyInCents` from `window.location.search`: on first render `buyInCentsParam` from `useLocalSearchParams()` could be undefined on web → `routeBuyInCents` undefined → `buyInCents` undefined (no joinState, lobby not loaded) → `hasValidBuyIn` false.
- Then: “Missing buy-in data” in ConnectingTableShell, and `joinOptions` in useTableRealtime was undefined → Colyseus join could omit or fail buy-in → server could reject or not re-seat.

**With** the URL fallback: first render already gets `routeBuyInCents` from the actual URL, so buy-in is valid immediately and the same join flow as “lobby → rejoin” runs (openTable with buy-in, realtime join with buy-in, TABLE_SNAPSHOT, table UI).

---

## 8. Reload vs new tab

- **Reload**: same tab, full reload; same sequence as above.
- **New tab**: new process/tab, same URL; same cold load and same sequence. No difference in app logic; both are “load document at table URL with query.”

(If the user had used “Open in new tab” from a link that already had the correct URL and query, the new tab is still a cold load.)
