# Phase 5 Two-Browser Release Gate Log

Gate Version: v1.1
Purpose: Manual release gate for two-browser multiplayer correctness, persistence, and reconnect/recovery behavior.

Date: 2026-02-16
Environment: local
Backend commit: `72aa7f3349d2eee88ea90f45436261ab46d5ee1e` (dirty)
Client commit: `72aa7f3349d2eee88ea90f45436261ab46d5ee1e` (dirty)
Executed by: User + Codex (automated prechecks)
Automated gate command: `pnpm phase5:auto`
Automated evidence artifact: `artifacts/phase5-automated-gate.json`
Automated gate result: PASS (`verify`, `backend-health`, `client-startup`)

## Preconditions (Hard)
- [x] `pnpm verify` passed
- [x] `pnpm harness:headless` passed
- [x] Backend startup command verified (`pnpm tsx src/index.ts` stayed alive until timeout in automation run)
- [x] Client startup command verified (`pnpm dev:web` process observed running in automation run)
- [ ] Two test users available (required)
- [ ] Both users have bankroll >= table min buy-in (required)

## Session Setup
- Browser A user:
- Browser B user:
- Table ID:
- Blinds:
- Buy-ins:

## Shared State Sync Check
- [ ] A and B see same seated users
- [ ] A and B see same board
- [ ] A and B see same pot
- [ ] A and B see same to-act player
Notes:
- Automated startup checks completed on February 16, 2026.
- Full automated Phase 5 gate completed on February 16, 2026; see `artifacts/phase5-automated-gate.json`.
- Additional automated reliability coverage completed on February 16, 2026:
- stale room-id recovery retry (`tableId -> latest roomId`) added in client transport.
- stable route identity (`id = tableId`) validated by `apps/client/src/tests/lobbyTables.normalize.test.ts`.
- harness validates empty-table persistence + successful rejoin on same room.
- Remaining checklist items require interactive two-browser manual execution.

## Explicit Refresh/Rejoin Checks
- [ ] Hard refresh `/table/:tableId` mid-hand produced no auth error
- [ ] Hard refresh `/table/:tableId` mid-hand did not force rebuy
- [ ] Hard refresh `/table/:tableId` mid-hand preserved same seat/stack

## Required Hand Lines (Play at least 5 hands)

### Hand 1: check/check line
- [ ] Executed
- [ ] Turn prompts were correct
- [ ] Pot progression was correct
Notes:

### Hand 2: bet/fold line
- [ ] Executed
- [ ] Turn prompts were correct
- [ ] Pot progression was correct
Notes:

### Hand 3: raise/call line
- [ ] Executed
- [ ] Min-raise displayed correctly
- [ ] Pot progression was correct
Notes:

### Hand 4: all-in line
- [ ] Executed
- [ ] Side-pot behavior (if applicable) was correct
- [ ] Settlement matched expected outcome
Notes:

### Hand 5: showdown line
- [ ] Executed
- [ ] Winner and payouts were correct
- [ ] Next hand auto-started
Notes:

## Action Validity Checks
- [ ] Only active player could act each turn
- [ ] Non-active player saw no illegal actions
- [ ] `check`/`call` labels and amounts were correct
- [ ] `bet`/`raise` min/max bounds were correct
Notes:

## Reconnect + Auto-Action Cap Checks
- [ ] Mid-hand disconnect/reconnect recovered session
- [ ] Reconnected user resumed with correct snapshot state
- [ ] Disconnect on turn caused auto-action (`CHECK` when legal, else `FOLD`)
- [ ] Exceeding auto-action cap marked player sitting out
- [ ] Seat remained preserved after cap-triggered sit-out
- [ ] Reconnect cleared sit-out and restored normal play eligibility
Notes:

## Restart Recovery Checks
- [ ] After server restart, seats restored as disconnected
- [ ] Rejoin after restart returned correct seat/stack
Notes:

## TTL Expiry Check (Optional)
- [ ] Simulated TTL expiry for sitting-out seat
- [ ] Verified forced release + cashout behavior
Notes:

## Accounting Checks
- [ ] Pot and payouts were correct across all tested hands
- [ ] No payout mismatch observed
- [ ] No stuck hand / deadlock state observed
Notes:

## Result
- [ ] PASS
- [ ] FAIL

Failure summary (if FAIL):

## Audit
- Verified by:
- Verification date:
- Verification notes:

Follow-up issues:
- Observation: harness logs `POKER_ROOM_DISPOSED` at process teardown with `autoDispose=true` after forced shutdown sequence.
- Status: expected teardown behavior in automated shutdown path; no join/rejoin regression observed prior to shutdown.
- Manual verification focus: confirm behavior in long-running server session.
