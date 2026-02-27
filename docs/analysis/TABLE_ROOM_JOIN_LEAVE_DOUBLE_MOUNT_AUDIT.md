# Table Room Join/Leave — Double-Mount Prevention Audit

Related: [TABLE_RECONNECT_FROZEN_ACTIONS_ANALYSIS.md](./TABLE_RECONNECT_FROZEN_ACTIONS_ANALYSIS.md) (session scoping, healing, stale DISCONNECTED).

## Risk

React (e.g. Strict Mode) or fast navigation can run: **effect → cleanup → effect**. If the first effect’s `connect()` is still in flight when cleanup runs, we used to end up with:

1. Session A: cleanup runs → `disconnect()` called → `room` is still `null` (join not resolved) → nothing to leave.
2. Session A’s `connect()` later resolves → room joins, CONNECTED/onOpen fire → **orphaned** session A is now connected.
3. Session B: second effect runs → new session, `connect()` starts.
4. Two connections for the same table → server sends SESSION_REPLACED to A; we fixed UI with session scoping + snapshot healing, but the root cause was orphaned sessions.

## Fix (Implemented)

**Transport (`createColyseusSession`):**

- **`disposed` flag:** Set to `true` at the start of `disconnect()`. When cleanup runs before join resolves, `disposed` is set and `room` is still null so we return.
- **After join resolves:** Right after `room = await client.joinById(...)` (or `reconnect`), before setting `connected` or calling `onMessage(CONNECTED)` / `onOpen`, check `if (disposed && room)`. If true, call `room.leave(4000)`, set `room = null`, and `return`. So an in-flight connect that completes after cleanup never registers as connected and never fires CONNECTED/onOpen; we leave the room immediately so the server doesn’t keep that session as the “current” one.

Result: only the **current** effect’s session can ever become the active connection. No orphaned session from a previous effect.

- **After every await:** Same stale check after join/reconnect and after `resolveRoomIdByTableId`; if stale, leave and return without CONNECTED/listeners.
- **Generation guard:** `connectAttemptId` per connect, `DISPOSED_CONNECT_GEN` on disconnect; room callbacks and post-await use it so stale joins and old closures never dispatch.
- **Reconnect timer:** Returns early if `disposed`; timer callback checks `disposed` before `connect()`.

## Flow Summary

| Step | Before fix | After fix |
|------|------------|-----------|
| Effect 1 runs | createRealtimeSession(), void connect() | Same |
| Cleanup runs (e.g. Strict Mode) | disconnect(): room is null, no-op | disconnect(): disposed = true, no-op (room still null) |
| Effect 1’s connect() resolves | room set, CONNECTED/onOpen fire → orphan | if (disposed) { room.leave(4000); return } → no CONNECTED |
| Effect 2 runs | createRealtimeSession(), void connect() | Same; only this session can connect |

## Where It Lives

- **`apps/client/src/realtime/transport.ts`** — `createColyseusSession`: `disposed` flag and `connectAttemptId` (generation) set in `disconnect()`; checked after every await and at start of each room callback; reconnect timer checks `disposed` before firing.
- **`apps/client/src/realtime/useRealtimeChannel.ts`** — Effect cleanup calls `session.disconnect(false)` then `sessionRef.current = null`; no change needed.
- **Leave code:** Stale/superseded leaves use `LEAVE_CODE_STALE_OR_REPLACED` (4000); matches server (PokerRoom) use for SESSION_REPLACED/rebind; treated as non-error.
- **`apps/client/src/tests/transport.colyseus.dispose.test.ts`** — Unit tests: (1) late join resolve after dispose — no CONNECTED, `room.leave(4000)` called; (2) dispose during preflight `resolveRoomIdByTableId` await — no join afterward (Client not called).

## Optional Further Hardening

- **Single session per scope+id:** A shared ref or module-level “current session for tableId” could reject or tear down an older session when a new one is created for the same id. The disposed check already prevents the common double-mount case; this would add defense for multiple components mounting the same table.
- **AbortController:** Pass an AbortSignal into the transport and abort when cleanup runs; connect() could pass it to fetch or skip the join if aborted. Same goal as `disposed`; the flag is minimal and sufficient today.
