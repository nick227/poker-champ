# Sitting Out, Rejoining, and Table Count — Proposal

This document describes how the server currently detects disconnects and handles sitting out, why empty tables can still show users in the lobby, and proposes changes to harden sitting out, rejoining, table count (including bots), and table deletion.

---

## 1. Current behavior

### 1.1 Disconnect detection

- **Entry**: `PokerRoom.onLeave(client, code)` when a client leaves the room (tab close, navigate away, network drop, etc.).
- **Consented** (`code === CloseCode.CONSENTED`): treated as explicit leave: `handleConsentedLeave(userId)` → force fold, `removePlayer` with cash-out, `TableSeatSessionService.markLeft`, `updateHumanCountMetadata()`.
- **Not consented**: treated as disconnect:
  - `dealer.unbindClient(userId)`, `markDisconnectedSafe(userId, deadlineTs)` (sets `player.connected = false`, `disconnectDeadlineTs`), `TableSeatSessionService.markSittingOut`.
  - `allowReconnection(client, 60)` (Colyseus 60s window).
  - **On reconnect**: bind client, `markReconnectedSafe(userId)`, persistence touch, `SESSION_RESTORED`, snapshot; player becomes `connected = true`, and if `status === "ABANDONED"` and `street === "WAITING"` and `stackCents > 0`, status is set back to `ACTIVE`.
  - **On reconnect failure**: if persistent seats are **on**, we do **not** call `markAbandoned`; the player remains in state as disconnected (and keeps being auto-folded when toAct). If persistent seats are **off**, we call `markAbandoned(userId)`.

So: there is no explicit “leave table” action from the UI; closing the tab or changing page is a disconnect, and we only remove the human on consented leave or (when persistent seats are off) when the reconnect window expires.

### 1.2 Terminology: Reconnecting… vs Sitting out

- **Reconnecting…** = temporary connectivity state (grace window). Engine: `player.connected = false`, `now < disconnectDeadlineTs`. They are auto-check/fold when toAct. **Reconnecting… is not “sitting out”** and should not update seat-session state beyond `disconnectAt` bookkeeping (we record when they dropped, but we do not treat grace as sitting-out for persistence or analytics).

- **Sitting out** = deliberate or expired absence state. Either: (a) deadline passed (`connected === false` and `now >= disconnectDeadlineTs`), or (b) engine status is **ABANDONED** or **OUT** (reconnect window expired, auto-action cap, or kick). Persistence: `SEATED_SITTING_OUT` and related semantics apply to this state, not to the grace window.

- **Engine today**: During grace we set `TableSeatSessionService.markSittingOut` (session `disconnectAt`); that is bookkeeping. The **UI** should show “Reconnecting…” during grace and “Sitting out” only once the deadline has passed or the player is ABANDONED/OUT, so product semantics do not drift with persistence (“sitting out” = absent, not “temporarily reconnecting”).

- **Snapshot**: Each seat includes `connected` and `status`; we will add `disconnectDeadlineTs` (and recommended `serverNowTs`) so the client can render the two labels without conflating them.

### 1.3 Lobby table count and “empty tables showing users”

- **Backend**: `PokerRoom.computeHumanCount()` counts **every** human in `state.playersById` (any human, connected or not, ACTIVE or ABANDONED/OUT). This value is written to room metadata as `humanCount` and exposed by:
  - `GET /api/lobby/tables` (LobbyRouter): `players: humanCount ?? r.clients`
  - LobbyRoom `queryTables()`: same.
- **Problem**: When the last human closes the tab, they remain in `playersById` (disconnected, then possibly ABANDONED after cap or after reconnect timeout if non-persistent). So `humanCount` stays ≥ 1 and the lobby shows “1 player” (or more) for a table that has **no connected** humans. So “empty” tables (no one actually there) still show as having users.
- **Bots**: Lobby does **not** count bots in `players`; it uses `humanCount`. So the wrong count is purely from counting seated humans regardless of connection. We also do **not** remove bots when the last human leaves; the table can have only bots + sitting-out humans.

### 1.4 Table delete rules

- **Backend**: DELETE table allowed only when `metadata.humanCount === 0` (LobbyRouter).
- **Client**: `GameTableRow` uses `connectedHumanCount === 0` for showing the Delete button; `lobbyTables` normalizes `connectedHumanCount` from the API, but the **backend never sends** `connectedHumanCount`, so it is always `undefined` and the client uses `?? 0`, which can make delete appear when it shouldn’t or hide when it should.
- **Intent**: Tables should be deletable when no human is **actually present** (no connected humans). Today we block delete if any human is **seated** (including sitting out), so tables with only sitting-out humans cannot be deleted.

### 1.5 UI for sitting out

- **OpponentStrip**: Opponents with `status === "folded"` or `"sittingOut"` get `opacity-50` and a status label (“Sitting out” for sittingOut). Snapshot includes `connected` but the client does not use it to show “Disconnected” vs “Sitting out.”
- **HeroZone**: Hero OUT/ABANDONED is shown as “Sitting out”; no separate “Disconnected” state.

---

## 2. Problems summary

| Issue | Description |
|-------|-------------|
| **Lobby count** | `humanCount` counts all seated humans (connected + sitting out). Empty tables (no one connected) still show 1+ players. |
| **Bots when last human leaves** | When the last human leaves (consented or abandoned), bots are not removed; table can be “human-empty” but bot-full. |
| **No explicit “leave table”** | Humans can only leave by consented leave (if we add a button) or by closing tab / navigating away (disconnect). Disconnect path keeps them in state as sitting out. |
| **Table delete** | Delete is gated on `humanCount === 0`, so tables with only sitting-out humans cannot be deleted. Backend does not expose `connectedHumanCount`, so client delete logic is inconsistent. |
| **Sitting out styling** | We show “Sitting out” and faded (opacity) for OUT/ABANDONED but do not clearly distinguish “Disconnected (reconnecting)” vs “Sitting out (abandoned).” Reconnect should immediately clear the disconnected state in the UI. |

---

## 3. Proposal

### 3.1 Connected human count for lobby and delete

- **Source of truth**: `connectedHumanCount` is computed from the **room’s runtime binding map** (client↔userId), **not** from `PlayerState.connected`. Reason: `PlayerState.connected` is derived and can lag; the binding map is authoritative. Recommended rule (server): a human is “connected” if the room has a bound client for that userId (e.g. `getBoundClient(userId)` is defined, or equivalently the map that tracks which client is bound to which userId contains that userId).
- **Add `connectedHumanCount`** in room metadata: count only humans in `state.playersById` for whom the binding map has a client. Compute in `PokerRoom` (e.g. `computeConnectedHumanCount()`) and update whenever:
  - A human joins or leaves (consented or disconnect/abandon).
  - A human reconnects (so count goes up as soon as they reconnect).
- **Expose in API**: In `GET /api/lobby/tables` and in LobbyRoom `queryTables()`, add `connectedHumanCount` to each table. Use it for:
  - **Lobby “players” display**: `players: connectedHumanCount ?? humanCount ?? r.clients ?? 0` so the number reflects “who is actually at the table right now.”
  - **Delete**: Allow DELETE when `connectedHumanCount === 0` (and keep creator check). Optionally still allow when `humanCount === 0` for backward compatibility, but the primary rule should be “no connected humans.”
- **Backend DELETE**: In LobbyRouter, require `connectedHumanCount === 0` (from room metadata) instead of (or in addition to) `humanCount === 0`, so tables with only sitting-out humans can be deleted.

This fixes “empty tables still showing users” and aligns delete with “no one is here.”

### 3.2 Clear bots when last human leaves

- Bot cleanup triggers when there are **zero seated humans** (`humanCount === 0`), not merely zero connected humans. That way we do not wipe bots when humans are only temporarily reconnecting.
- When the **last human** is removed from the table (consented leave or abandon/removal), after the usual hand-advance and snapshot updates, **remove all bots** (e.g. call `removeBot` for each bot in `state.playersById`). So: on any leave/remove event, if `humanCount === 0`, remove all bots and then update metadata.
- Implementation point: after `handleConsentedLeave` or after `markAbandoned` (and any subsequent `removePlayer` from release-pending-seats), check if any human remains; if not, remove all bots. This prevents “ghost” tables with only bots and sitting-out humans.

### 3.3 Three UI states: Reconnecting… vs Sitting out

- **Reconnecting…** = temporary connectivity state (grace window). Not “sitting out”; seat-session state beyond `disconnectAt` bookkeeping should not treat grace as sitting-out.
- **Sitting out** = deliberate/expired absence state: deadline passed OR `status === ABANDONED`/OUT.

| Engine state | UI label |
|--------------|----------|
| `connected === false` AND `now < disconnectDeadlineTs` | **Reconnecting…** |
| `connected === false` AND `now >= disconnectDeadlineTs` | **Sitting out** |
| `status === "ABANDONED"` | **Sitting out** |
| else | normal |

**Server**: Expose `disconnectDeadlineTs` per seat in the table snapshot (from `PlayerState`). **Recommended**: Snapshot also includes `serverNowTs` — a single timestamp captured **once at the start** of snapshot construction (not called per seat or mid-build, so all seats share the same value and slow construction cannot yield inconsistent times). Client compares `serverNowTs` against `disconnectDeadlineTs` instead of `Date.now()` to avoid clock-skew flicker (browsers and mobile devices can drift; the reconnect-window boundary is where visual churn is most noticeable). Cost: one integer in snapshot; benefit: deterministic labeling across all clients. Authoritative time-sensitive decisions should use server time.

**Client** (no debounce timers; deadline encodes intent):

```ts
const now = seat.serverNowTs ?? Date.now();
if (!seat.connected) {
  if (now < seat.disconnectDeadlineTs) label = "Reconnecting…";
  else label = "Sitting out";
} else if (seat.status === "ABANDONED") {
  label = "Sitting out";
}
```

Apply faded style for both “Reconnecting…” and “Sitting out.” On reconnect, snapshot is emitted with `connected: true` and (when applicable) status back to ACTIVE, so the UI updates immediately.

### 3.4 Table deletion with only sitting-out users

- With **connectedHumanCount** in place, tables are deletable when `connectedHumanCount === 0`. A table that has only sitting-out humans can be deleted by the creator.
- **Mandatory seat session cleanup** (see 3.6): When deleting a table, close all seat sessions for that table before disposing the room.

### 3.5 Delete race and join attempts on deleted table

A player may reconnect while someone else deletes the table, or open `/table/:id` from history/bookmark after the table was deleted. This is acceptable; join paths must be **defensive**, not a reason to block deletion during grace.

**Required behavior**:
- **Any join attempt** (reconnect or fresh HTTP/WS join) must return **TABLE_GONE** if the table no longer exists.
- Client: on TABLE_GONE, show toast “Table no longer exists”, navigate to lobby.

So: when reconnecting, `joinRoom(tableId)` → if room not found (or join returns table-gone), return TABLE_GONE. When loading `/table/:id`, if the room is missing or join fails with table-gone, same: TABLE_GONE and route to lobby. This keeps both WS reconnect and HTTP/bookmark flows aligned.

Do **not** block table deletion during grace windows; that would re-introduce ghost tables.

### 3.6 Seat session cleanup on table delete (mandatory)

When the delete handler runs:

1. Fetch all seat sessions for the table.
2. Mark each as LEFT with reason **TABLE_DELETED** (e.g. `markLeft({ … reason: "TABLE_DELETED" })` or `closeAllForTable(tableId, "TABLE_DELETED")`). Use a canonical reason so analytics and UI messaging can distinguish table deletion from normal disconnect/leave.
3. Then delete the room and broadcast deletion.

This prevents “Rejoin previous table?” prompts and orphaned UI. This lives **inside** the delete handler, not as optional cleanup.

### 3.7 Sitting-out timeout sweep (near-term, not optional)

Without a sweep, `humanCount` and seat sessions grow forever and stats/analytics rot. This is **mandatory** near-term, not optional.

**Safety rule**: Run the sweep **only when no one is connected** at the table. If `connectedHumanCount > 0`, do not purge seats — even if someone is ABANDONED for 30+ minutes — so we do not evict seats while others are actively playing. So: sweep only for tables with `connectedHumanCount === 0`, or only purge abandoned players on tables that currently have no connected humans.

**Recommended policy** — background sweep (e.g. every 5–10 minutes), gated as above:

- For each such table/player with `status === "ABANDONED"` and abandoned/disconnected longer than **30 minutes**: call `removePlayer(userId)`, mark seat session LEFT.
- Use persisted session `disconnectAt` (or an engine `abandonedAt` if added) to compute “how long abandoned”; threshold 30 minutes.

### 3.8 Optional: explicit “Leave table”

Add a “Leave table” (or “Get up”) action that sends a message to the room; server treats it as consented leave (`handleConsentedLeave`). Gives users a clear way to leave without closing the tab.

---

## 4. Updated final ruleset

| Area | Rule |
|------|------|
| **Presence** | Lobby shows `connectedHumanCount` only. `connectedHumanCount` is computed from the room’s binding map (client↔userId), not from `PlayerState.connected`. |
| **Delete** | Allowed when `connectedHumanCount === 0`. |
| **Bots** | If after any removal `humanCount === 0` (zero seated humans) → remove all bots. Not triggered by `connectedHumanCount === 0`. |
| **UI states** | **Reconnecting…** = temporary grace (`!connected` AND `now < disconnectDeadlineTs`); **Sitting out** = expired/absent (`!connected` AND `now >= disconnectDeadlineTs` OR `status === ABANDONED`). Use `serverNowTs` in snapshot when available to avoid clock-skew flicker. |
| **Delete handler** | Require `connectedHumanCount === 0`; mark all seat sessions LEFT with reason **TABLE_DELETED**; then delete room and broadcast. |
| **Join / reconnect** | Any join attempt (reconnect or fresh, e.g. `/table/:id` from bookmark) must return TABLE_GONE if table no longer exists. Client shows toast “Table no longer exists” and navigates to lobby. |
| **Sweep job** | Purge long-abandoned seats only when `connectedHumanCount === 0` (or only abandoned players on tables with no connected humans). ABANDONED + > 30 min → `removePlayer`, mark seat session LEFT. |

**Why this version is safer**

- No ghost tables.
- No zombie bots.
- No misleading “Disconnected” labels (Reconnecting… vs Sitting out).
- No stuck seat sessions (sweep + cleanup on delete).
- No reliance on fragile timing (deadline in snapshot).

**Architectural separation**

- **Presence** = connected (who is at the table right now).
- **Participation** = seated (who has a seat / session).

Lobby presence and delete are driven by presence only; we do not overload sitting-out semantics with lobby presence.

---

## 5. Implementation checklist (summary)

1. **Backend – connected count**
   - Add `computeConnectedHumanCount()` in PokerRoom: count humans in `state.playersById` for whom the room’s binding map has a client (e.g. `getBoundClient(userId)` defined). Do **not** use `PlayerState.connected`.
   - Maintain `connectedHumanCount` in room metadata; update on join, leave (consented and disconnect/abandon), and reconnect.
   - In GET `/api/lobby/tables` and LobbyRoom `queryTables()`, add `connectedHumanCount`; set `players` to `connectedHumanCount ?? humanCount ?? r.clients` for display.
   - In LobbyRouter DELETE, require `connectedHumanCount === 0` (and creator).

2. **Backend – snapshot**
   - Expose `disconnectDeadlineTs` per seat in table snapshot (from `PlayerState`).
   - **Recommended**: Expose `serverNowTs` in snapshot: capture once at the top of snapshot construction (do not call `Date.now()` per seat or mid-build), then reuse that value for the whole snapshot so all seats are consistent.

3. **Backend – bot cleanup**
   - After any path that removes a human (consented leave or abandon + release), if `humanCount === 0` (zero seated humans), remove all bots, then update metadata. Do not trigger on `connectedHumanCount === 0` only.

4. **Backend – delete handler**
   - Before disposing room: fetch all seat sessions for table, mark each LEFT with reason **TABLE_DELETED**; then delete room and broadcast.

5. **Backend – join / TABLE_GONE**
   - Any join attempt (reconnect or fresh, e.g. `/table/:id` from bookmark): if room no longer exists or table was deleted, return TABLE_GONE so client can show toast and navigate to lobby.

6. **Backend – sitting-out sweep**
   - Background job (e.g. every 5–10 min), **only for tables with `connectedHumanCount === 0`** (or only purge abandoned players on such tables): for `status === ABANDONED` and abandoned/disconnected longer than 30 min (e.g. session `disconnectAt` or `abandonedAt`), call `removePlayer`, mark seat session LEFT.

7. **Client – lobby**
   - Ensure `normalizeTable()` maps `connectedHumanCount` from API; use it for delete (GameTableRow) and for “players” display.

8. **Client – table UI**
   - In OpponentStrip and HeroZone: use `connected`, `disconnectDeadlineTs`, and (when present) `serverNowTs` from snapshot; `const now = seat.serverNowTs ?? Date.now()`; show “Reconnecting…” when `!connected` and `now < disconnectDeadlineTs`; show “Sitting out” when `!connected` and `now >= disconnectDeadlineTs` or `status === ABANDONED`; apply faded style for both.

9. **Client – TABLE_GONE**
   - On TABLE_GONE (reconnect or fresh join to missing table): show toast “Table no longer exists”, navigate to lobby.

10. **Docs and tests**
    - Update docs that refer to “humanCount” for lobby/delete to mention `connectedHumanCount`, binding-map source of truth, Reconnecting… vs Sitting out definitions, TABLE_DELETED, sweep gate, and serverNowTs.
    - Add or adjust tests for: metadata from binding map, lobby count, delete with TABLE_DELETED cleanup, TABLE_GONE on reconnect and on fresh join, sweep only when connectedHumanCount === 0, and bot removal when humanCount === 0.

---

## 6. References

- Disconnect/reconnect flow: `src/rooms/PokerRoom.ts` (`onLeave`, `markDisconnectedSafe`, `markReconnectedSafe`), `docs/analysis/PLAYER_JOIN_LEAVE_DISCONNECT_DEEP_DIVE.md`.
- Human count: `PokerRoom.computeHumanCount()`, `LobbyRouter` GET `/tables`, `LobbyRoom.queryTables()`.
- Sitting out / status: `PlayerLifecycleService` (`markDisconnected`, `markReconnected`, `markAbandoned`), `TableSeatSessionService.markSittingOut`, snapshot `connected`, (to add) `disconnectDeadlineTs` and (recommended) `serverNowTs` in `SnapshotService` and `TableSeatSnapshotSchema` in realtime-contract. Binding map: `PokerRoom.getBoundClient(userId)` / `userIdBySessionId`.
- Client: `table.adapter.ts` (SEAT_STATUS_TO_OPPONENT, mapSeatsToOpponents), `OpponentStrip.tsx`, `HeroZone.tsx`, `GameTableRow.tsx`, `lobbyTables.ts`.
- Delete: `LobbyRouter` DELETE handler, `GameTableRow` canDelete, `docs/analysis/GAME_DELETE_BUTTON_ANALYSIS.md`.
