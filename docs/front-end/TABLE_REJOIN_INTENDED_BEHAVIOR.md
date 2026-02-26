# Table Rejoin Behavior (Intended Result)

Date: 2026-02-26
Status: Proposed contract for implementation

## Why this doc

Current behavior can mix two concepts:
- navigation away from the table UI
- explicitly leaving a table seat

That causes ambiguous outcomes (temporary restore, then later seat/bot reset). This doc defines the intended contract.

## Verified current signals (code)

- Server has two leave paths in `src/rooms/PokerRoom.ts`:
  - `code === CloseCode.CONSENTED`: explicit leave (`handleConsentedLeave`), mark left, possible bot cleanup when no humans.
  - otherwise: disconnect/reconnect path (`markDisconnected`, `allowReconnection`, `SESSION_RESTORED`).
- Client route changes currently tear down realtime connection (`apps/client/src/realtime/useRealtimeChannel.ts` + `apps/client/src/realtime/transport.ts`).
- Rejoin signaling exists:
  - `WELCOME` with `joinMode: "NEW"`
  - `SESSION_RESTORED` with `joinMode: "RESTORE"`

## Intended result

### 1) Soft Return (default for "Back to lobby" / navigation)

When user navigates to lobby and later re-enters the same table, this is a **session restore**, not a fresh seat.

Expected outcome:
- Same seat restored.
- Same stack restored.
- Same table participants/bots remain unchanged.
- Same hand continuity rules apply:
  - if hand still active, player may be temporarily out of action until legal to act;
  - if between hands, player is eligible normally.
- UI should show reconnecting/restoring state briefly, then stable table state.
- No late reset of board/stack after restore.

Server/client markers:
- re-entry should resolve to `SESSION_RESTORED` (`joinMode: "RESTORE"`).
- should not emit `WELCOME` (`joinMode: "NEW"`) for the same seated session.

### 2) Hard Leave (explicit user intent)

Only an explicit `Leave table` / `Close table` action should perform a full leave.

Expected outcome:
- Seat is exited immediately (consented leave semantics).
- Mid-hand: forced-fold safety semantics apply.
- Stack is cashed out / seat session marked left.
- On later entry, user is a fresh join and must buy in again (`joinMode: "NEW"`).
- If this was the last human seat, bots may be removed per room policy.

## Product rule for now (recommended)

To keep the door open for multi-tabling, define:
- `Back to lobby` = **Soft Return** behavior.
- `Leave table` (explicit control) = **Hard Leave** behavior.

Do not overload a route change with hard-leave semantics.

## Acceptance criteria

1. Lobby -> Table -> Lobby -> Same Table returns `SESSION_RESTORED` and preserves seat/stack.
2. No delayed second transition to `NEW` join after successful restore.
3. Bot roster is unchanged across soft return/rejoin.
4. Explicit hard leave returns `WELCOME`/`joinMode: "NEW"` on next entry.
5. Hard leave from last human can remove bots; soft return must not.

## Test checklist

- E2E: lobby -> table -> lobby -> same table; assert one active connection and no danger toast.
- E2E: verify hero stack before/after soft return is unchanged.
- E2E: explicit hard leave then re-enter; assert fresh join (buy-in required/new stack source).
- Integration: stale session close cannot override a newer restored binding.

## Notes

This contract separates UX navigation from seat lifecycle. That separation is the key requirement for robust multi-table behavior.
