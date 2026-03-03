# Game (Table) Loading Flow

This document describes how a user gets from "loading" to a rendered table: client navigation, realtime join, server snapshot emission, validation, and client state update. It records a production bug (invalid `snapshotSeq`), the **no-silent-drop** policy, and standardizations.

**Related:** [TABLE_PAGE_RELOAD_AND_NEW_TAB_FLOW.md](./TABLE_PAGE_RELOAD_AND_NEW_TAB_FLOW.md), [GAME_LOGIC_AND_FLOW.md](./GAME_LOGIC_AND_FLOW.md).

---

## 1. End-to-end flow (high level)

| Phase | Actor | What happens |
|-------|--------|----------------|
| 1 | Client | User opens table URL or taps "Join" on a lobby table; TableScreen mounts or focus switches to table. |
| 2 | Client | Auth hydrated → open-table effect runs → `openTable(tableId, { buyInCents })`; realtime session starts with Colyseus `joinById(roomId, { tableId, buyInCents, token })`. |
| 3 | Server | PokerRoom receives join; validates options; **JOIN** runs economy (buy-in); **RECONNECT** restores seat/stack with **zero economic mutation** (no buy-in). Then calls `dealer.emitSnapshotToUser(userId, "JOIN")` or `"RECONNECT"`. |
| 4 | Server | SnapshotService builds TABLE_SNAPSHOT, **always** validates (`TableOutboundMessageSchema`). If valid → send TABLE_SNAPSHOT. If invalid → log (one-line SNAPSHOT_DROP), then **send ERROR** `{ code: "SNAPSHOT_INVALID", message: "..." }` so the client is never left in loading with no message. |
| 5 | Client | Realtime receives either TABLE_SNAPSHOT → store snapshot → exit loading; or ERROR → store error message → UI shows error (and should offer Retry / Leave). |

**Invariant:** Loading is resolved only when the client receives a **valid TABLE_SNAPSHOT**. Any other outcome (ERROR, timeout, disconnect) must result in a visible error or timeout UX, never an indefinite spinner.

---

## 2. Server-side snapshot path

### 2.1 JOIN vs RECONNECT semantics

| Reason | When | Economy | Seat/stack |
|--------|------|--------|------------|
| **JOIN** | First time seating at the table | Buy-in applied (economy side effects). | New seat, stack = buy-in. |
| **RECONNECT** | Re-join within reconnect window after disconnect | **Zero economic mutation.** No buy-in, no balance change. | Seat and stack restored from persisted session. |

If RECONNECT ever runs buy-in or modifies stack, you get phantom chips or double-debits. The boundary must stay strict: **JOIN → economy side effects; RECONNECT → no economic mutation.**

### 2.2 When TABLE_SNAPSHOT is sent for loading

Both JOIN and RECONNECT use **user-targeted** emission:

- `PokerRoom` → `this.dealer.emitSnapshotToUser(userId, "JOIN")` or `emitSnapshotToUser(userId, "RECONNECT")`.
- `Dealer` → `SnapshotService.emitToUser(userId, reason, actionId)`.

Other reasons (e.g. `ACTION_ACCEPTED`, `BOT_ACTION`, `HAND_END`) use `emitToAll(reason, actionId)` and broadcast to every connected client.

### 2.3 SnapshotService: validation and no silent drop

- **Validation:** Always run (production and non-production). Cost is negligible; catching invalid payloads in prod avoids client crashes and invisible deadlock.
- **On success:** Send TABLE_SNAPSHOT.
- **On failure:** Do **not** drop silently. Log a **one-line searchable** entry, then send **ERROR** to the affected client(s):
  - `code: "SNAPSHOT_INVALID"`
  - `message: "Table failed to load due to a server error. Please try again or leave the table."`
- **Log format:** `SNAPSHOT_DROP tableId=%s userId=%s reason=%s path=%s` (with `path` = first failing schema path, e.g. `payload.snapshotSeq`). Structured fields (`tableId`, `userId`, `reason`, `snapshotSeq`, `path`) are also logged for search. This turns long debugging sessions into quick lookups.

### 2.4 Sequence and build steps

| Method | Used for | Sequence |
|--------|----------|----------|
| `emitToAll(reason, actionId)` | Broadcasts (action, hand start/end, etc.) | `nextSnapshotSeq()` — single in-memory counter, positive. |
| `emitToUser(userId, reason, actionId)` | JOIN, RECONNECT | Same: `nextSnapshotSeq()`. |

**snapshotSeq semantics:** Monotonic **per room lifetime**, not globally persistent. It is in-memory per room. If you later shard tables across processes, horizontally scale rooms, or restart room actors, the sequence may reset or clash; clients do not rely on global monotonicity, only on receiving a valid snapshot. Document this so future work does not assume cross-restart or cross-room ordering.

Build steps (shared):

1. **Sequence:** `nextSnapshotSeq()` (positive, per-room monotonic).
2. **Base payload:** `buildBaseSnapshot(reason, actionId, snapshotSeq)`.
3. **Hero patch:** `buildHeroPatch(userId, base, toActUserId)`.
4. **Finalize:** `finalizePayload(payload, userId)`.
5. **Validate:** `TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload: final })`.
6. **Send:** If valid → `client.send("TABLE_SNAPSHOT", final)`. If invalid → log SNAPSHOT_DROP (with tableId, userId, reason, path), then `client.send("ERROR", { version: 1, code: "SNAPSHOT_INVALID", message })`.

Schema lives in `packages/realtime-contract`. Server must **import types from the contract**, not redefine them. Key numeric constraints include `snapshotSeq` (positive), `table.*Cents` (positive where applicable), `lastAction.seq` (positive when present).

---

## 3. Client-side loading behavior

- **Realtime:** Session created with `joinOptions: { tableId, buyInCents }`. No snapshot yet → loading state.
- **Exit loading:** Only when the client receives a **valid TABLE_SNAPSHOT** and runs `setSnapshot(tableId, payload)`. No other event (e.g. TABLE_READY, handshake, or partial snapshot) currently replaces this. If you add intermediate events later, keep the invariant: **loading is resolved only by the first valid TABLE_SNAPSHOT** (or by explicit error/timeout).
- **On ERROR (e.g. SNAPSHOT_INVALID):** Table store sets error message; UI should show the message and offer **Retry** and **Leave table** so the user is never stuck.

### 3.1 Timeout (required UX)

A **timeout is not optional**. Without it, any network or server blip can leave the user with an indefinite spinner.

- After **8–10 seconds** with no TABLE_SNAPSHOT (and no ERROR), show:
  - "Still connecting…" (or "Taking longer than usual")
  - **Retry** and **Leave table** actions.
- Same for RECONNECT: avoid indefinite "Restoring…" with no feedback.

---

## 4. Production bug: table stuck on loading (March 2026)

### What happened

- User joined or reconnected; server logged `POKER_JOIN_SUCCESS` / restore, then dropped the TABLE_SNAPSHOT due to validation failure. Client received nothing → infinite loading.

### Root cause

- `emitToUser` used a user-only sequence that returned **negative** values. The contract requires `snapshotSeq` **positive**. Every JOIN/RECONNECT snapshot failed validation and was dropped (and previously nothing was sent in place).

### Fix

- Use a single positive `nextSnapshotSeq()` for both `emitToAll` and `emitToUser`.
- **No silent drop:** On validation failure, log SNAPSHOT_DROP (with tableId, userId, reason, path) and send **ERROR** `SNAPSHOT_INVALID` so the client always gets a message and can show Retry/Leave.

---

## 5. Contract as source of truth

- **Realtime contract** (`packages/realtime-contract`) is the single authority for TABLE_SNAPSHOT and ERROR shapes.
- **Server:** Imports types and schemas from the contract; does not redefine payload shapes.
- **CI:** Consider a test that builds a minimal JOIN/RECONNECT snapshot and runs `TableOutboundMessageSchema.safeParse` to catch schema drift early.

---

## 6. Runbook: table loading forever

1. Check server logs for **SNAPSHOT_DROP** (one-line: `tableId=`, `userId=`, `reason=`, `path=`).
2. If present: schema violation. Inspect `path` and structured `errors` (e.g. `payload.snapshotSeq`, required fields, types).
3. If no SNAPSHOT_DROP: look for join/restore logs, network issues, or client never receiving TABLE_SNAPSHOT (e.g. transport disconnect before snapshot).
4. Link: this doc.

---

## 7. Summary

| Item | Description |
|------|-------------|
| **Flow** | Client join → server JOIN (economy) or RECONNECT (no economy) → emitSnapshotToUser → build + **always validate** → send TABLE_SNAPSHOT or ERROR SNAPSHOT_INVALID. |
| **No silent drop** | On validation failure: log SNAPSHOT_DROP (tableId, userId, reason, path), then send ERROR so client can show message + Retry/Leave. |
| **snapshotSeq** | Single positive counter per room; monotonic per room lifetime only (not globally persistent). |
| **JOIN vs RECONNECT** | JOIN = economy side effects; RECONNECT = zero economic mutation. |
| **Loading invariant** | Resolved only by first valid TABLE_SNAPSHOT (or by error/timeout). |
| **Timeout** | Required: ~8–10s then "Still connecting…" + Retry + Leave. |

---

## 8. Future: spectators and replay

Evaluate whether the same snapshot architecture (TABLE_SNAPSHOT as state authority, single sequence per room, ERROR on invalid) can support **spectators** or **replay mode** without structural change. If new message types or handshake steps are added, maintain the invariant that loading (or equivalent "waiting for state") is never left unresolved without a message or timeout.
