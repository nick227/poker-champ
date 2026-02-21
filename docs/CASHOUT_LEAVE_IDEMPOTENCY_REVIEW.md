# Cash-Out / Leave Idempotency — Final Review

## What Was Fixed

- **Duplicate cash-out**: `cashedOutUserIds` ensures at most one `processCashGameCashOut` per user per table session; duplicate calls log and no-op.
- **Duplicate leave/removal**: `leaveInProgressUserIds` ensures only one `removePlayer` runs per user at a time; concurrent calls log and return empty plans.
- **Re-join**: `addPlayer` and `restorePlayerFromSession` clear `cashedOutUserIds` for that user so a later leave can cash out again.

## Verified Safe

| Scenario | Result |
|----------|--------|
| Two `onLeave(CONSENTED)` in quick succession | First runs full removal + cash-out; second hits `cashedOutUserIds` or `leaveInProgressUserIds`, no second cash-out or "player left". |
| `releasePendingSeats()` with same userId twice in list | First `removePlayer` runs; second sees `cashedOutUserIds.has(userId)` and returns. |
| TTL reap then consented leave for same user | One path wins (TTL or leave); the other sees player already gone or already cashed out. |
| `kickUser` → `client.leave()` → `onLeave(CONSENTED)` | Single path: `handleConsentedLeave` → `removePlayer(cashOutAfterRemoval: true)`. |
| Cash-out throws in `cashOutRemainingStack` | We `delete(userId)` from `cashedOutUserIds` so a later recovery path is not blocked. |
| `removePlayer` throws (e.g. forceFold or persistence) | `finally` clears `leaveInProgressUserIds`; no leak; retry can run again. |

## Possible Problems / Edge Cases

### 1. Cash-out fails after player already removed (funds stuck)

**Path**: `removePlayer(..., { cashOutAfterRemoval: true })` removes player from state, then calls `cashOutRemainingStack`; `CashierService.processCashGameCashOut` throws. We remove userId from `cashedOutUserIds` and log. A later `removePlayer(userId)` finds no player and returns without calling `cashOutRemainingStack`. So the table balance is never credited back to the user.

**Pre-existing**: Same risk existed before the idempotency changes (lifecycle always removed then cashed out on consent leave).

**Mitigation**: Rely on existing recovery (e.g. TTL reap uses `session.stackCentsSnapshot` and calls `processCashGameCashOut` for expired sessions). Optional: add a periodic or on-start job that cashes out any `PlayerBalance` row for users no longer in any room.

### 2. HTTP POST `/api/economy/cash-out` is a separate path

**Risk**: If the client (or another service) calls this with `tableId` and `amountCents` while the user is still seated, then the user leaves, we get: (1) HTTP cash-out credited, (2) lifecycle cash-out on leave. Two credits for the same logical leave.

**Current state**: Client does not call `economy.cashOut`; leave is the only cash-out path in practice.

**Hardening (optional)**: In `EconomyRouter` POST `/cash-out`, reject or restrict when the user is currently seated at that table (e.g. require "only when not in room" or remove this endpoint for table cash-out and only use lifecycle cash-out).

### 3. Set growth (memory)

**`cashedOutUserIds`**: Only grows when a user leaves and is cashed out. Cleared for a userId when they re-join (`addPlayer` / `restorePlayerFromSession`). For a long-lived table with many unique leavers who never re-join, the set grows but is bounded by "ever left this table" (typically small).

**`leaveInProgressUserIds`**: Cleared in `finally` every time; size at most number of concurrent leave calls (usually 0–1 per user). No leak.

### 4. Order of guards in `removePlayer`

We check `cashedOutUserIds` then `leaveInProgressUserIds`. Correct: if already cashed out we don’t want to run removal again; if leave is in progress we don’t want a second concurrent removal.

### 5. `err: any` in `addPlayer` catch

Unrelated to this fix; existing `err: any` in `addPlayer` (line 71). Consider `err: unknown` and type-safe message check for consistency.

## Recommendations

1. **Keep current behavior** for lifecycle idempotency; no change required for the duplicate cash-out/leave bug.
2. **Optional**: Add a comment in `EconomyRouter` that table cash-out should be done only via leave (onLeave → handleConsentedLeave), not via this endpoint while seated.
3. **Optional**: If you add a "Cash out" button, make it trigger leave (e.g. close room / leave table) rather than calling POST `/api/economy/cash-out` with a client-provided amount.
4. **Optional**: Add monitoring/alerts on log messages `"Duplicate cash-out prevented"` and `"Duplicate remove/leave prevented"` to detect duplicate paths in production.

## Summary

- Lifecycle cash-out and leave are idempotent; duplicate cash-out and duplicate "player left" from the same logical leave are prevented.
- Remaining risks: funds stuck if cash-out fails after removal (pre-existing; rely on TTL/recovery), and theoretical double-credit if HTTP cash-out is used while seated (client currently doesn’t; can be hardened in the router if needed).
