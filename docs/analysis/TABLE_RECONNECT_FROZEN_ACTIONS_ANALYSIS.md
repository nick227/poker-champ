# Table Reconnect: Frozen Actions (Hero Turn, Buttons Non-Responsive)

## Symptom

After reload → lobby → rejoin table → rebuy, the hand starts and it is hero’s turn, but the action bar is unresponsive (buttons disabled). Console shows:

- `SESSION_REPLACED` then `CONNECTED`
- Several `TABLE_SNAPSHOT` (RECONNECT, SEAT_CHANGE, SESSION_RESTORED, HAND_START, BOT_ACTION)
- Then `DISCONNECTED` and “Session replaced by newer connection (no retry)”
- **After** DISCONNECTED, more `TABLE_SNAPSHOT` messages still arrive (SEAT_CHANGE, HAND_START, BOT_ACTION)

So the UI shows the latest snapshot (hero to act) but treats the table as disconnected and blocks actions.

---

## Root Cause

1. **Two connections for the same table**  
   For a short time the client can have two Colyseus sessions for the same table (e.g. Strict Mode double-mount, or reconnect before the previous session fully closed). Session A (older) and Session B (newer) are both connected.

2. **Server rebinds to the newer session**  
   Server sends `SESSION_REPLACED` to the **old** client (A) and closes it with leave code 4000. Session B remains.

3. **Old session’s onLeave runs on the client**  
   When A’s room closes, the Colyseus transport runs `onLeave` and calls `options.onMessage({ type: "DISCONNECTED" })`. That callback is the one registered when **session A** was created.

4. **Connection status is global per tableId**  
   The table realtime handler doesn’t know which session sent the message. So when it receives `DISCONNECTED`, it clears (or sets) connection status for that `tableId`. So the **stale** session A’s leave clears status for the table.

5. **Live session B is still connected**  
   Session B keeps receiving `TABLE_SNAPSHOT` (HAND_START, BOT_ACTION, etc.), so snapshots and store stay up to date, but we never set status back to CONNECTED for that table. So we end up with:
   - Latest snapshot = hero to act, hand in progress
   - `connectionStatusByTableId[tableId]` = cleared → treated as DISCONNECTED
   - Action bar uses `isConnectionBlockingActions(connectionStatus)` → true → buttons disabled

So the freeze is **not** from rebuy or hand logic; it’s from a **stale DISCONNECTED** (from the replaced session) overwriting connection status while the **current** session is still connected and receiving snapshots.

---

## Fix (Implemented)

### 1. Snapshot healing (defensive)

When we receive `TABLE_SNAPSHOT`, call `deps.setConnectionStatus(tableId, "CONNECTED")`.

- Receiving a snapshot means **some** connection for that table is live.
- If we had been incorrectly marked DISCONNECTED by a stale session’s onLeave, the next TABLE_SNAPSHOT from the live session restores CONNECTED and actions work again.
- If we are truly disconnected, we won’t get TABLE_SNAPSHOT, so we don’t incorrectly set CONNECTED.

### 2. Belt and suspenders

On `CONNECTED` and `SESSION_RESTORED`, explicitly call `deps.setConnectionStatus(tableId, "CONNECTED")`.

### 3. Session scoping (prevent bad state)

Transport passes `payload: { sessionId }` with CONNECTED/DISCONNECTED. Store keeps `activeSessionIdByTableId`. Handler: on CONNECTED sets active session; on DISCONNECTED ignores when `payload.sessionId !== getActiveSessionId(tableId)` (stale leave). Stale DISCONNECTED no longer clears status; snapshot healing remains as redundancy.

---

## Optional future hardening

- **Single connection per table:** Ensure only one Colyseus session per tableId (e.g. in `useRealtimeChannel` / transport, disconnect or cancel any existing session for the same scope+id before creating a new one, or key the channel so only one connect runs at a time). That reduces the chance of a second, “replaced” session ever existing.
- **Session id in callbacks:** If the transport passed a session/connection id into the table message handler, we could ignore DISCONNECTED when it comes from a session that is not the “current” one (e.g. the one we last received CONNECTED or TABLE_SNAPSHOT from). That would require a small contract change between transport and table handler.

---

## References

- `apps/client/src/realtime/tableRealtime.message.ts` — TABLE_SNAPSHOT healing, CONNECTED/SESSION_RESTORED → CONNECTED, DISCONNECTED session scoping
- `apps/client/src/realtime/transport.ts` — Colyseus session, CONNECTED/DISCONNECTED payload `{ sessionId }`, `onLeave` → `DISCONNECTED`, `SESSION_REPLACED`
- `apps/client/src/stores/table.store.ts` — `activeSessionIdByTableId`, `setActiveSessionId`, `getActiveSessionId`, `clearActiveSessionId`
- `apps/client/src/components/domain/table/actionBar.logic.ts` — `isConnectionBlockingActions(connectionStatus)` (action bar gates only on connectionStatus)
- `src/rooms/PokerRoom.ts` — `rebindClientExclusive`, send `SESSION_REPLACED` to old client

## Tests

- `apps/client/src/tests/useTableRealtime.test.ts` — “keeps CONNECTED when DISCONNECTED is from a stale session (session scoping)”, “stale DISCONNECTED then TABLE_SNAPSHOT leaves status CONNECTED (healing path)”
