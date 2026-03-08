# Timeout and Seat-Lifecycle Summary

This document explains why a player can be removed (or appear removed) before the configured turn timeout, and why they may see messages like:

- "Could not rejoin table. You are not seated."
- "You are not seated at this table."

It focuses on actual runtime code paths in the current codebase.

## Quick Answer

`TURN_TIMEOUT_TOTAL_MS = 20 * 60_000` is only one timeout path (per-turn inactivity while still connected and seated).

Players can be sat out or removed earlier via other paths:

1. Disconnect/reconnect timeout path (default `20m` window).
2. Consented leave path (immediate seat removal behavior).
3. Auto-action cap path (N disconnected auto-acted hands, default `3`).

There is also a client/server close-code mismatch that can route stale/replaced connections into the consented-leave branch.

## Implemented Changes (current patch)

Completed in this pass:

1. Close-code alignment for stale/replaced client disconnect.
   - Client transport now uses `4001` for stale/replaced leave (`SESSION_REPLACED` semantics), matching server expectations.
2. In-table Join fallback path added.
   - New table inbound command: `JOIN_TABLE` with `buyInCents`.
   - Server now supports seating a bound-but-not-seated user via `JOIN_TABLE`.
   - Client now shows `Join table` CTA on non-seated table state (no forced lobby round-trip).
3. Contract/store/controller wiring added for `JOIN_TABLE`.
   - Shared schema, client dispatch, page controller action, and router/view wiring.
4. Timeout policy increased to 20 minutes for active human protection.
   - Server turn timeout now `20 * 60_000`.
   - Client turn countdown now aligned to 20 minutes.
   - Room reconnect grace now defaults to 20 minutes (`POKER_RECONNECT_TIMEOUT_MS`, fallback 20m).
5. Disconnected auto-action cap now respects reconnect grace.
   - Disconnected humans are not force-abandoned by auto-action cap while still inside disconnect grace window.
6. Pending seat release now honors reconnect-deadline protection.
   - Disconnect-timeout pending removals are not released while `now <= disconnectDeadlineTs`.
   - This prevents early `playersById` removal before reconnect grace expiry.

Bot retention behavior:

- Bots are only auto-removed when `humanCount === 0`.
- A disconnected/sitting-out human who is still seated still counts as human presence, so bots are retained.

Notes:

- This is a practical Phase 0/1 fix.
- Full `SeatLifecycleService` centralization is still recommended as the next structural phase.

## Main Time/Removal Mechanisms

## 1) Human turn timeout (20m)

Server setting:

- `src/engine/dealer/timing.ts`
- `TURN_TIMEOUT_TOTAL_MS = 20 * 60_000`

Flow:

- Turn automation schedules a human turn timeout when current actor is connected human.
- Dealer fires timeout after `TURN_TIMEOUT_TOTAL_MS` and calls internal sit-out:
  - `src/engine/Dealer.ts` (`scheduleHumanTurnTimeout` -> `setPlayerSittingOutInternal(userId, true)`).

Effect:

- Player becomes `ABANDONED` (sitting out), not necessarily immediately removed from table.
- This path is not the only seat-impacting timeout path.

## 2) Disconnect timeout (20m default)

Room leave/disconnect flow:

- `src/rooms/PokerRoom.ts`
- On non-consented disconnect: `deadlineTs = Date.now() + RECONNECT_TIMEOUT_MS`
- Calls `markDisconnected...` and `allowReconnection(client, ceil(RECONNECT_TIMEOUT_MS / 1000))`

If reconnection fails:

- Non-persistent seats: calls `markAbandoned...`
- Persistent seats: seat may be preserved, but player is still disconnected/sitting out state.

Related sweep:

- `src/engine/Dealer.ts` has `sweepDisconnectDeadlines()` (every 10s) that can also mark abandoned when `disconnectDeadlineTs` has passed.

Effect:

- This can happen at reconnect-window expiry (default 20 minutes), independent from turn timeout.

## 3) Auto-action cap for disconnected humans

Config:

- `src/config/seats.ts`
- `getAutoActionHandCap()` default is `3`

Flow:

- While disconnected and to-act, system auto-checks/folds.
- Per-hand auto-actions increment counter.
- At cap, player status is set to `ABANDONED`:
  - `src/engine/dealer/services/TurnAutomationService.ts`

Effect:

- In fast hands, this can sit someone out quickly even if a long per-turn timeout exists.

## 4) Seat release/removal after abandon

Abandon can set pending leave/removal, then release seat at safe boundary:

- `src/engine/dealer/services/PlayerLifecycleService.ts`
- `pendingLeave`, `pendingRemovalReason`, `RELEASE_PENDING_SEATS`
- Dealer executes release:
  - `src/engine/Dealer.ts` (`releasePendingSeats()` -> `removePlayerInternal(userId)`)

Effect:

- Player can transition from seated-sitting-out to fully removed, then rejoin fails as "not seated."

## Why "You are not at this table"/"not seated" appears

Server rejoin error is emitted when the user is no longer in `playersById`:

- `src/rooms/PokerRoom.ts`
- `REJOIN_FAILED_NOT_SEATED` -> "Could not rejoin table. You are not seated."

Client UI also derives non-seated from snapshot hero section:

- `src/engine/dealer/services/SnapshotService.ts` -> `youAreSeated: Boolean(hero)`
- `apps/client/src/components/domain/table/views/ActiveTableView.tsx` shows "You are not seated at this table." when false.

So the message is a consequence of server-side seat state, not the turn timer itself.

## Rejoin UX: why users get stuck

Current behavior is split across multiple components and states:

- Server `REJOIN` only works if user is still seated:
  - `src/rooms/PokerRoom.ts`
  - If `!dealer.hasPlayer(userId)`: `REJOIN_FAILED_NOT_SEATED`
- Active table view only shows `Rejoin` when hero is still seated + sitting out:
  - `apps/client/src/components/domain/table/views/ActiveTableView.tsx`
  - `heroIsSittingOut = heroIsSeated && heroStatus === "SITTING_OUT"`
- If hero is not seated in active view, UI now shows fallback recovery CTA:
  - "You are not seated at this table."
  - `Join table` (when recoverable) and `Back to lobby`.

Result:

- Without fallback handling, unwanted timeout/removal can move player from sitting-out to not-seated.
- Current patch mitigates this by allowing direct in-table rejoin via `Join table`.

## How rejoin SHOULD work (product behavior)

Rejoin should be one unified "recover playability" flow, not just a "send REJOIN" button.

Decision matrix should be:

1. `TABLE_GONE`:
   - Show fatal state + Back to lobby.
2. `SEATED_SITTING_OUT` (seat exists):
   - Show `Rejoin` (maps to server `REJOIN` or sit-in command).
3. `NOT_SEATED_BUT_JOINABLE` (same table still exists, seat available, bankroll valid):
   - Show `Join table` CTA directly on table screen (no forced lobby round-trip).
4. `NOT_SEATED_OUT_OF_CHIPS`:
   - Show rebuy/deposit guidance and CTA.
5. `CONNECTION_UNSTABLE`:
   - Keep user on table screen, retry safely with bounded backoff and clear status.

User-facing principle:

- Never strand the user on a non-actionable "not seated" screen when a safe recovery action exists.

## Centralized, reliable, maintainable solution

## A) Centralize seat-recovery state machine (server)

Add a single recovery status response (or snapshot field) as source of truth, for example:

- `recovery.state`: `TABLE_GONE | SEATED_ACTIVE | SEATED_SITTING_OUT | NOT_SEATED_JOINABLE | NOT_SEATED_BLOCKED`
- `recovery.reason`: `DISCONNECT_TIMEOUT | CONSENTED_LEAVE | SESSION_REPLACED | AUTO_ACTION_CAP | OUT_OF_CHIPS | TABLE_FULL | ...`
- `recovery.actions`: `["REJOIN"]`, `["JOIN"]`, `["REBUY"]`, `["LOBBY_ONLY"]`

This removes client guesswork from mixed signals (`hero.youAreSeated`, error strings, connection status).

Important sequencing note:

- Introduce a `SeatLifecycleService` owner before broad recovery payload rollout.
- Otherwise recovery data can still be computed from fragmented rules and drift over time.

`SeatLifecycleService` should own:

- seat transitions
- recovery-state computation
- seat-release gating/finalization

Dealer and Room should emit events and delegate transition decisions.

## B) Unify protocol constants in shared contract

Move close codes and recovery error enums into shared contract package:

- Session-replaced code must be shared and identical client/server.
- Rejoin/join failure reasons should be typed enum values (avoid string parsing).

## C) Centralize client recovery controller

Create one client module (for example `useSeatRecoveryController`) that:

- Consumes snapshot + connection + server recovery info.
- Computes one deterministic `uiState` + allowed actions.
- Owns retries/backoff/idempotent dispatch for `REJOIN`/`JOIN`.
- Exposes stable actions used by both `ActiveTableView` and `EmptyTableView`.

This prevents duplicated ad-hoc logic across:

- `useTablePageController.tsx`
- `rejoin.helpers.ts`
- per-view conditional branches

## D) Keep UI action-oriented

Single `SeatRecoveryPanel` component should render:

- status text
- best next action (`Rejoin`, `Join table`, `Rebuy`, `Back to lobby`)
- detailed error only when no recovery action remains

Avoid hardcoding "You are not seated at this table." without a possible action if table is still joinable.

## E) Observability and tests

Add structured events:

- `SEAT_RECOVERY_STATE_CHANGED`
- `SEAT_RECOVERY_ACTION_SENT`
- `SEAT_RECOVERY_ACTION_RESULT`

Track reasons and latency to recovery. Add integration tests for:

- stale connection replacement
- disconnect window expiry
- transition from seated -> not seated -> rejoin/join recovery
- table gone path

## Critical Mismatch Found: Close Code 4000 vs 4001

Client realtime transport:

- `apps/client/src/realtime/transport.ts`
- Uses `LEAVE_CODE_STALE_OR_REPLACED = 4001` (fixed)

Server room logic:

- `src/rooms/PokerRoom.ts`
- Treats `CloseCode.CONSENTED` (`4000`) as intentional leave path.
- Defines session-replaced code as `4001` (`LEAVE_CODE_SESSION_REPLACED`).

Previous risk (before fix):

- A stale/replaced connection leaving with `4000` could be interpreted as user-consented leave.
- That could trigger seat-removal logic much earlier than expected.

## Client/Server Timer Mismatch (UX confusion)

Server:

- 20m turn timeout (`src/engine/dealer/timing.ts`)

Client countdown:

- 20m total (`apps/client/src/components/domain/table/hooks/useTurnCountdown.ts`)

Effect:

- UI countdown can imply one behavior while server enforces another.
- Not the direct cause of seat removal, but it makes behavior look inconsistent.

## End-to-End Sequence That Matches Your Symptom

1. Player is active at table.
2. Connection churn/replacement/disconnect occurs.
3. Leave path is treated as consented leave (or disconnect grace expires, or auto-action cap hits after grace).
4. Player eventually removed from `playersById`.
5. Rejoin attempt checks seat presence and returns `REJOIN_FAILED_NOT_SEATED`.
6. UI displays "not seated"/"not at this table."

## Practical Priorities

1. Fix close-code alignment first.
   - Ensure stale/replaced connection path uses server's intended non-consented/session-replaced code (`4001`), not consented `4000`.
2. Add immediate UX safety net.
   - If `REJOIN_FAILED_NOT_SEATED` but table is still joinable, render `Join table` directly on table screen.
3. Create shared protocol contract package for lifecycle/close-code constants.
   - `CloseCodes`, `SeatLifecycleState`, `SeatLifecycleReason`, `RecoveryActions`.
4. Introduce `SeatLifecycleService` as single transition owner.
   - Dealer/Room emit events; service decides lifecycle transition and release policy.
5. Expose server-authored recovery payload from this service.
   - Deterministic `state`, `reason`, `deadlineTs`, `actions`.
6. Decide explicit product policy for disconnect timeout vs turn timeout precedence.
   - Today, disconnect path can resolve faster than turn timeout.
7. Centralize client rendering via one recovery controller/panel.
8. Align client countdown with server timeout constants.
9. Add explicit logging/metrics tags for lifecycle transitions:
   - `CONSENTED_LEAVE`, `DISCONNECT_TIMEOUT`, `AUTO_ACTION_CAP`, `ADMIN_KICK`, `SESSION_REPLACED`.
   - Plus transition/result events like `SEAT_STATE_CHANGED`, `SEAT_RELEASED`, `SEAT_RECOVERY_SUCCEEDED`, `SEAT_RECOVERY_FAILED`.

## Component Boundaries (target)

- `SeatLifecycleService`:
  - single authority for seat ownership/recovery transitions
  - computes recovery payload
  - decides seat release
- `Dealer`:
  - gameplay only (hand flow, betting, turn mechanics)
  - emits lifecycle events (`TURN_TIMEOUT`, `AUTO_ACTION_CAP_HIT`, `HAND_ENDED`)
- `PokerRoom`:
  - transport/session/close-code/reconnect orchestration
  - forwards transport events to lifecycle service
  - does not directly decide seating outcomes

## Permanent Concept Split

Keep these separate in code and types:

- `connection` (socket/session transport)
- `seat ownership` (has seat at table)
- `hand participation` (currently in-hand eligible actor set)
- `recoverability` (can return to active play from current state)

These can combine in valid ways, for example:

- disconnected + seated + recoverable

## Relevant Files

- `src/engine/dealer/timing.ts`
- `src/engine/Dealer.ts`
- `src/engine/dealer/services/TurnAutomationService.ts`
- `src/engine/dealer/services/PlayerLifecycleService.ts`
- `src/rooms/PokerRoom.ts`
- `src/engine/dealer/services/SnapshotService.ts`
- `apps/client/src/realtime/transport.ts`
- `apps/client/src/components/domain/table/hooks/useTurnCountdown.ts`
- `apps/client/src/components/domain/table/views/ActiveTableView.tsx`
