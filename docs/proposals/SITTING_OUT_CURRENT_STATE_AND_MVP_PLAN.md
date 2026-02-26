# Sitting Out: Current-State Assessment, Troubleshooting, and MVP Proposal

## Scope
This document audits how a human player can end up "sitting out" today, why users may experience this unexpectedly, and proposes an MVP to add explicit user-controlled `Sit Out` / `Rejoin` toggles.

## Current authoritative behavior
The server is authoritative for player participation state. The UI mostly reflects snapshot fields (`status`, `connected`, `disconnectDeadlineTs`) and does not currently have explicit sit-out controls.

### Current ways a human becomes "sitting out"

1. Disconnect path (most common)
- Entry point: `PokerRoom.onLeave(...)` for non-consented leave.
- Behavior:
  - Marks player disconnected with a 60s grace deadline (`markDisconnected`).
  - Player remains seated, `connected=false`, and is auto-check/folded when to act.
  - If reconnection does not complete, player becomes `ABANDONED` (via disconnect sweep, or immediate path when persistent seats are off).
- Relevant files:
  - `src/rooms/PokerRoom.ts`
  - `src/engine/Dealer.ts`
  - `src/engine/dealer/services/PlayerLifecycleService.ts`
  - `src/engine/dealer/services/TurnAutomationService.ts`

2. Disconnect deadline expiration (60s)
- `Dealer` runs periodic disconnect sweeps and marks overdue disconnected users as `ABANDONED`.
- This happens even if the player still has chips and a seat.
- Relevant file:
  - `src/engine/Dealer.ts`

3. Auto-action cap for disconnected humans
- Disconnected humans are auto-acted (check/fold) when to-act.
- At hand end, if they were auto-acted while disconnected, a per-user counter increments.
- When counter reaches `AUTO_ACTION_HAND_CAP` (default `3`), player is set to `ABANDONED`.
- Relevant files:
  - `src/engine/dealer/services/TurnAutomationService.ts`
  - `src/config/seats.ts`
  - `src/rooms/PokerRoom.ts` (optional persistent-seat `markSittingOut` callback)

4. Join/rejoin while a hand is in progress
- Newly added/restored players during active hand are not dealt into current hand:
  - often represented as `ABANDONED` and/or `sittingOutUntilNextHand=true` until next hand boundary.
- This is expected behavior, but can look like "sudden sit out" to users.
- Relevant files:
  - `src/engine/dealer/services/PlayerLifecycleService.ts`
  - `src/engine/dealer/services/HandLifecycleService.ts`

5. Out of chips (`OUT`)
- If a player's stack is zero at hand lifecycle boundaries, they become `OUT`.
- Client maps `OUT` to sitting out language.
- Relevant files:
  - `src/engine/dealer/services/HandLifecycleService.ts`
  - `apps/client/src/components/domain/table/table.adapter.ts`
  - `apps/client/app/table/useTableScreenController.tsx`

6. Persistent-seat bootstrap restore on room restart
- Restored seats are intentionally loaded as disconnected+sitting out until user rejoins.
- Relevant file:
  - `src/rooms/PokerRoom.ts` (`bootstrapPersistentSeatRecovery`)

## Why users may feel they were "still in game" but got sitting out

1. Short network/session interruptions that cross grace window
- If reconnect does not complete within ~60s, server transitions to `ABANDONED`.

2. Repeated intermittent disconnects across hands
- Even with reconnect attempts, disconnected auto-actions can accumulate and hit cap (`AUTO_ACTION_HAND_CAP`), causing sit-out.

3. Client reconnect limits
- Client transport caps retries (`MAX_RECONNECT_ATTEMPTS`). If exhausted, user can remain disconnected long enough to be abandoned.
- Relevant file:
  - `apps/client/src/realtime/transport.ts`

4. Mid-hand rejoin semantics
- Rejoining during active hand does not guarantee immediate participation in that same hand.

5. UI terminology overlap
- UI status mapping uses "Sitting out" for both `ABANDONED` and `OUT`; reconnecting is shown only in specific deadline windows.
- Relevant file:
  - `apps/client/src/components/domain/table/table.adapter.ts`

## Troubleshooting playbook for unexpected sitting out

1. Correlate server logs for the affected user/table
- `POKER_LEAVE_STALE_SESSION_IGNORED`
- `POKER_RECONNECT_WINDOW_EXPIRED_SEAT_PRESERVED`
- `AUTO_ACTION_CAP_REACHED_SIT_OUT`
- `POKER_JOIN_REBOUND_PERSISTED`

2. Confirm whether transition was disconnect-timeout or cap-based
- Disconnect-timeout: user had `disconnectDeadlineTs` and crossed deadline.
- Cap-based: look for auto-action cap event and hand-level progression.

3. Validate runtime config values
- `AUTO_ACTION_HAND_CAP`
- reconnect/grace assumptions (currently 60s in room/dealer flow)
- persistent seat feature toggle

4. Inspect snapshot timeline around event
- Track `connected`, `disconnectDeadlineTs`, and `status` for seat over time.
- Confirm if state moved `ACTIVE -> disconnected/reconnecting -> ABANDONED`.

5. Check duplicate session replacement cases
- Session replacement can disconnect older client and prevent reconnect loops.

## Gaps in current design

1. No explicit user intent model
- "Sitting out" currently conflates:
  - intentional absence (not implemented yet)
  - network/disconnect handling
  - out-of-chips state

2. No user-facing sit-out/rejoin command
- Contract supports only poker actions (`FOLD/CHECK/CALL/BET/RAISE/ALL_IN`) for gameplay.

3. ABANDONED is overloaded
- Used for disconnect-related gameplay state and various lifecycle transitions, making intent ambiguous.

## MVP proposal: explicit user sit-out/rejoin

### Goals
- Add explicit user control: `Sit Out` and `Rejoin`.
- Keep disconnect handling behavior intact.
- Separate intentional sit-out from disconnect-derived sit-out.

### MVP state model
Add explicit player-intent flags (server state + snapshot):
- `manualSitOut: boolean`
- `manualSitOutRequestedAtTs?: number` (optional telemetry aid)

Keep existing disconnect fields as-is:
- `connected`
- `disconnectDeadlineTs`
- `status` (`ABANDONED/OUT/...`) for engine lifecycle

Display precedence for hero/opponents (MVP):
1. `OUT` (out of chips)
2. `manualSitOut=true` (intentional)
3. disconnected + within grace (`Reconnecting`)
4. disconnected/abandoned (`Sitting out (disconnected)`)
5. normal active/folded/all-in states

### MVP protocol/API changes
Add new inbound table messages in `realtime-contract`:
- `SET_SIT_OUT` payload: `{ sitOut: boolean }`

Server handling in `PokerRoom`:
- Validate bound/authenticated client.
- Call dealer lifecycle method:
  - `setManualSitOut(userId, true|false)`

### MVP server behavior rules

1. Sit Out = true
- If `street === WAITING`: immediate exclusion from next hand start.
- If hand is active: mark as "sit out next hand" without forcing unsafe removal.
- Do not mark player disconnected.

2. Sit Out = false (Rejoin)
- Require `stackCents > 0`.
- If `street === WAITING`: include in next hand selection.
- If hand is active: queue for next hand (no mid-hand deal-in).

3. Disconnect flow remains independent
- Disconnect can still make user abandoned.
- Rejoin from disconnect is still controlled by reconnect flow.
- Manual sit-out should not be auto-cleared by reconnect unless user toggles it.

### MVP UI changes

1. Add toggle button in hero controls
- When seated and stack > 0:
  - show `Sit Out` when not manual-sit-out
  - show `Rejoin` when manual-sit-out

2. Copy updates
- Distinguish labels:
  - `Sitting out` (manual)
  - `Reconnecting...`
  - `Sitting out (connection lost)`
  - `Out of chips`

3. Action gating
- When manual-sit-out is true, disable action controls and show clear reason.

### MVP persistence
Store manual sit-out intent in seat session record (or mirrored table-player persistence) so reconnect/restores preserve user intent consistently.

### MVP tests

1. Server tests
- set sit out while waiting excludes next hand
- set sit out mid-hand applies next-hand exclusion
- rejoin while waiting restores eligibility
- rejoin mid-hand waits until next hand
- manual sit-out does not flip `connected`

2. Client tests
- correct status label precedence
- toggle button visibility/label
- action bar disabled when manual sit-out

3. Integration tests
- disconnect + manual sit-out interaction order
- persistent seat restore retains manual sit-out

## Suggested rollout order

1. Contract: add `SET_SIT_OUT` message schema.
2. Server: add manual sit-out flag and lifecycle handler.
3. Snapshot/UI: expose and render explicit manual/disconnect sit-out reasons.
4. Frontend: add toggle control in hero area.
5. Tests + logging additions.

## Bottom line
Unexpected "sitting out" today is most likely disconnect-related (deadline expiry) or auto-action cap while disconnected; it is not currently user-initiated because no sit-out command exists. The MVP should introduce explicit user intent (`manualSitOut`) as a separate axis from connectivity, then add a simple `Sit Out / Rejoin` control and message path end-to-end.
