# Game Events And Realtime Flow Review

Date: 2026-03-15

Scope:
- `apps/server/src/engine/Dealer.ts`
- `apps/server/src/engine/dealer/turn/TurnManager.ts`
- `apps/server/src/engine/dealer/turn/TurnAutomationService.ts`
- `apps/server/src/engine/dealer/hand/SnapshotService.ts`
- `apps/server/src/engine/dealer/hand/HandOrchestrator.ts`
- `apps/server/src/engine/dealer/hand/LifecycleExecutor.ts`
- `apps/server/src/rooms/PokerRoom.ts`
- `apps/client/src/realtime/tableRealtime.message.ts`
- `apps/client/src/features/table/components/table/hooks/useActionMessages.ts`
- `apps/client/src/features/table-page/useLiveTableStatusStripState.ts`
- Existing docs in `docs/reference` and `docs/rca-game-hang-2026-03-09.md`

## Purpose

This document reviews the live gameplay event system from action intake to snapshot delivery to client rendering. The focus is:

- timeout and stall risk
- snapshot and realtime event correctness
- client/server reconciliation behavior
- places where the system appears over-engineered relative to the core poker lifecycle
- concrete proposals to simplify and harden the system

## Executive Summary

The overall architecture is directionally correct:

- the server treats the dealer state as the source of truth
- snapshots are the primary state transport
- action processing is serialized through one queue
- stall detection and redrive now exist

The main weaknesses are not in the base poker rules. They are in the number of derived layers wrapped around the core state machine.

The biggest risks are:

1. Snapshot truth is mixed with local client intent state, notice state, transport state, reconnect state, and animation/status-strip state.
2. The engine uses several indirect progression triggers (`requestDrive`, queued auto-actions, lifecycle plans, timeout callbacks, stall monitor redrive), which makes ownership of "who advances the hand next" harder to reason about.
3. Snapshot payloads carry authoritative state, but clients still infer some progression from missing or delayed `actionId`, `lastAction`, hand-result latches, and local pending actions.
4. The observability surface is strong, but it is also becoming a second control surface. This is a warning sign of complexity creep.

The system does not look fundamentally broken. It does look like it is near the point where additional fixes will become slower and riskier unless the event model is simplified.

## Current Event Model

### Server-side authoritative flow

The current authoritative flow is:

1. Client sends `ACTION`.
2. `PokerRoom` validates and routes to `Dealer.handleAction(...)`.
3. `Dealer` serializes the action through `TurnManager.enqueuePlayerAction(...)`.
4. `ActionService.execute(...)` mutates game state and returns an `ActionResult`.
5. `Dealer.applyActionResult(...)` decides whether to:
   - emit a turn-advanced snapshot
   - advance street/showdown through lifecycle services
   - finish the hand
   - wait for players
6. `SnapshotService` builds and validates `TABLE_SNAPSHOT`.
7. Client receives snapshot and updates local state.
8. Separate client hooks derive notices, status-strip copy, pending-action clearing, reconnect UX, and hand-end messaging.

This is the correct high-level shape: command in, authoritative state change, snapshot out.

### Server-side progression paths

The hand can advance through multiple mechanisms:

- direct player action resolution
- `requestDrive("ACTION_RESOLVED_NEXT_ACTOR")`
- `maybeActForBot()`
- queued bot auto-actions in `TurnManager`
- queued human turn timeout
- lifecycle plan execution
- stall-monitor redrive from `PokerRoom`
- defensive self-heal methods in `Dealer`

This is where most stall risk lives. There are too many valid ways to cause progression.

### Client-side rendering model

The client does not render only from `TABLE_SNAPSHOT`. It renders from:

- authoritative snapshot state
- local pending action store
- `actionNotice` derived from `lastAction`
- `handResultMessage` derived from `lastHandResult`
- connection lifecycle messages
- status-strip internal phase machine
- table scene mode and action interactivity gates

This is serviceable for polished UX, but it means the user-visible game state is not a direct function of one object. That makes "stuck syncing", "wrong prompt", or "stale winner/notice" issues more likely.

## Strengths

### 1. Snapshot schema validation is in the right place

`SnapshotService` validates outbound snapshots before send. That is the correct choke point.

This is one of the best parts of the design because invalid state is stopped at the transport boundary instead of leaking into the client.

### 2. Serialized action processing is the right default

Using one queue for player actions and serialized state mutation is correct for a turn-based poker engine. It reduces race conditions dramatically.

### 3. The system now has recovery hooks

The existing stall RCA and subsequent work added:

- queue recovery after internal work failure
- redrive after discarded auto-actions
- room-level stall recovery redrive
- better runtime metrics

These are useful and were necessary.

### 4. The contract is mostly snapshot-first

The system already leans toward snapshot authority rather than event-sourced UI reconstruction. That is the right long-term choice for a game like this.

## Main Risks And Design Smells

### 1. Too many progression triggers

Current gameplay progression is spread across:

- `ActionService.execute`
- `Dealer.applyActionResult`
- `Dealer.requestDrive`
- `TurnAutomationService.maybeActForBot`
- `TurnManager` discard/retry behavior
- `LifecycleExecutor`
- `HandOrchestrator`
- room-level stall monitor

This is over-engineered for the core requirement, which is simple:

- apply one action
- decide next authoritative table state
- emit one snapshot
- if next actor is automated, schedule exactly one automated action owner

The current shape works, but it is hard to prove there is only one owner for "next step". That is why stale turn tokens and re-drive logic exist in so many places.

Risk:
- hidden no-op states
- duplicate redrives
- state progressed but next actor not scheduled
- more recovery code than primary-flow code

### 2. Snapshot truth is diluted by client-side inferred state

The client uses snapshots as truth, but not exclusively.

Examples:

- pending action is stored separately and may outlive the snapshot that logically resolved it
- status strip can show `Syncing action...` from local pending state even after server hand completion
- `useActionMessages` derives notices from `lastAction`
- `useLiveTableStatusStripState` maintains its own phase machine with winner holds, board reset, between-hands, and transport overrides

Risk:
- user sees a stale local state while server is correct
- extra reconciliation rules are required for hand end, reconnect, and turn movement
- every new UX improvement adds another derived state machine

This is the clearest current client-side complexity hotspot.

### 3. Snapshots are both state transport and implicit acknowledgment channel

The system uses `actionId` echoed in snapshots to reconcile local pending actions. That is reasonable, but some important snapshots do not naturally carry the initiating `actionId`, especially around transitions and terminal states.

That creates a weak coupling:

- state can be correct
- UI can still look unresolved

This is not a rules bug. It is a protocol design gap.

### 4. Lifecycle plans add indirection without fully owning the control loop

`HandLifecycleService` returning plan arrays is a valid pattern if:

- plan creation is pure
- plan execution is the only control surface

That is not fully true here because lifecycle plan execution coexists with `requestDrive`, direct snapshot sends, redrive hooks, and timeout callbacks.

As a result, plans are not the single orchestration mechanism. They are one orchestration mechanism among several.

Risk:
- added ceremony without full simplification benefit
- harder debugging because causality crosses service boundaries

### 5. Stall monitor is doing both observability and partial recovery

The stall monitor now:

- observes silence
- computes stall reasons
- logs
- conditionally triggers recovery redrive

That is acceptable as a safety net, but it should not become a normal progression dependency.

If gameplay correctness depends on stall-monitor redrive, the primary event loop is too indirect.

### 6. Snapshot build work is still coupled to live progression

`SnapshotService` does a substantial amount of work:

- avatar lookup with timeout
- hero patch generation
- state hashing
- validation
- emit hook work

Much of this is safe, but snapshots are still on the critical path of perceived game responsiveness.

Risk:
- expensive snapshot build slows the authoritative loop
- user-facing latency rises without a real rules issue

### 7. `lastAction` and `lastHandResult` are doing double duty

These fields serve:

- replay-ish UI context
- action notices
- winner banners
- sometimes pending action reconciliation

That makes them semantically overloaded.

They are useful metadata, but the client increasingly depends on them for more than display.

### 8. The system is heavy on self-heal branches

Examples include:

- `maybeSelfHealRoundClosedNoAction`
- `maybeSelfHealInvalidToActSeat`
- `ensureHumanTurnTimerForCurrentActor`
- turn-owner invariant redrive
- stall-monitor recovery redrive

Some self-heal code is healthy. Too much of it usually means the core state transition model is not tight enough.

## Timeout And Stall Risk Areas

### A. Turn ownership drift

The most important invariant is:

- if the hand is active and betting is open, one specific actor owns the next move

The code already checks this in several places, which is good, but the need for repeated checks shows this is still a fragile area.

Failure shape:
- `toActSeat` exists but actor is not actually actionable
- no timeout is armed
- bot action got discarded as stale
- hand remains active with no owner

### B. Queued auto-action staleness

Queued bot/disconnect actions are protected by turn tokens. That is correct, but it also means any scheduling delay creates discard paths that require redrive.

This is a good safety measure wrapped around a more complicated scheduling model than necessary.

### C. Snapshot silence after valid state mutation

Even if game state progresses correctly, the user perceives a stall when:

- no snapshot arrives
- no matching `actionId` arrives
- UI is left in a pending/syncing state

The system treats snapshot delivery as authoritative, which is correct, so snapshot emission latency or omission is effectively gameplay latency.

### D. Human timeout ownership

Human turn timeout scheduling is deduped with turn tokens, which is good. But timeout ownership is still coupled to the broader `requestDrive` and bot automation flow.

That increases the number of places where "deadline exists but timeout is not meaningfully armed" can emerge.

### E. Ghost tables and reconnect windows

Long reconnect grace windows plus non-auto-disposed rooms can keep hands around longer than useful, especially with bots and partial disconnects.

That does not always break gameplay, but it increases:

- background load
- noisy stall metrics
- ambiguity around whether a human is really still expected to act

## Over-Engineering Assessment

### Areas that look appropriately engineered

- single serialized action queue
- outbound snapshot validation
- idempotent `actionId` handling
- clear distinction between JOIN and RECONNECT economics

### Areas that look over-engineered

#### 1. Too many intermediate orchestration layers

The stack of:

- action service
- dealer action result handling
- requestDrive
- lifecycle executor
- hand orchestrator
- turn automation service
- turn manager

is heavier than necessary for a six-player turn-based game.

The engine should be easy to answer with one question:

"Given this authoritative state, what single component owns the next transition?"

Right now the answer is often "it depends".

#### 2. Client status-strip state machine complexity

`useLiveTableStatusStripState` is polished, but it is carrying too much product logic:

- terminal hand state
- transport state
- action prompt state
- pending-action stall detection
- inter-message throttling
- between-hand fake board reset state

That is a lot of responsibility for a display hook.

#### 3. Debug and parity instrumentation inside the live path

The runtime parity and decision-trace work is useful, but it also suggests the event model is hard enough that the system needs live dual-model comparison.

That is a signal to simplify the control plane, not just improve logging.

## Recommended Target Model

The target model should be:

1. Server state machine is the only authority.
2. Every accepted state transition emits exactly one authoritative snapshot.
3. There is exactly one next-step owner at any point:
   - waiting for human
   - scheduled bot/disconnect automation
   - lifecycle transition in progress
   - hand waiting state
4. Client UI derives primarily from snapshot plus connection status.
5. Client local intent state is strictly temporary and always subordinate to snapshot truth.

## Proposals

### Proposal 1: Introduce a single "next-step owner" model on the server

Add an explicit internal enum for who owns the next progression step:

- `IDLE`
- `WAITING_FOR_HUMAN`
- `WAITING_FOR_HUMAN_TIMEOUT`
- `WAITING_FOR_AUTOMATION`
- `RUNNING_LIFECYCLE`
- `WAITING_NEXT_HAND`

This does not need to be client-visible at first.

Benefits:
- easier stall diagnosis
- easier assertion of illegal states
- fewer implicit redrive paths
- simpler reasoning than "queue depth + toAct + needsAction + deadlines + runout"

### Proposal 2: Make snapshot reconciliation explicit, not incidental

Strengthen the snapshot contract so every client-action resolution path can reconcile against an authoritative snapshot without special inference.

Options:
- echo the initiating `actionId` through all state transitions caused by that action, including terminal and street-transition snapshots
- or add a dedicated `resolvedActionId` field separate from `actionId`

Recommendation:
- prefer `resolvedActionId`

Reason:
- `actionId` currently reads like "this snapshot was caused directly by that action"
- `resolvedActionId` reads like "the server confirms this local action is resolved"

That is cleaner and avoids overloading one field.

### Proposal 3: Separate display events from state snapshots on the client

The client should use snapshots for state and a smaller local display-event layer for polish.

Recommendation:
- keep `TABLE_SNAPSHOT` authoritative
- keep notices purely cosmetic
- never allow status-strip display logic to become the primary resolver of hand or action state

Concretely:
- pending hero action should clear from authoritative snapshot reconciliation only
- `useActionMessages` and `useLiveTableStatusStripState` should not need to infer state completion
- status strip should consume a simpler pre-derived "table phase" object from the controller, not build a complex phase machine itself

### Proposal 4: Collapse orchestration responsibilities

Short-term target:
- `ActionService` mutates state and returns a narrow result
- `Dealer` owns progression
- lifecycle services own only pure hand/street transition planning
- `requestDrive` becomes a thin boundary or disappears

Recommendation:
- avoid adding more self-heal paths
- instead reduce the number of legal control surfaces that can advance the hand

### Proposal 5: Make stall monitor strictly secondary

Keep the stall monitor, but define it as:

- logging
- metrics
- emergency redrive only after a strict silence threshold

Do not let it carry normal progression responsibility.

If a new fix requires the stall monitor to recover a common path, fix the primary hand loop instead.

### Proposal 6: Publish a minimal gameplay event contract

Add a compact reference document describing the only server-to-client event classes that matter to gameplay:

- `WELCOME`
- `CONNECTED` / `DISCONNECTED` / `SESSION_RESTORED`
- `TABLE_SNAPSHOT`
- `ERROR`

And for snapshots, define the gameplay-critical meanings of:

- `reason`
- `resolvedActionId` or future equivalent
- `hand`
- `lastAction`
- `lastHandResult`

This should explicitly say which fields are:

- authoritative for gameplay
- advisory for display only

Right now that distinction is implied, not sharp.

### Proposal 7: Move heavyweight optional enrichments off the hot path where possible

Candidates:
- avatar enrichment
- expensive emit hooks
- some replay/log side effects

If the payload can tolerate it, optional enrichments should not delay the authoritative snapshot.

For example:
- emit a fast authoritative snapshot first
- update non-critical enrichments later if needed

This is only worth doing if profiling shows real latency, but the design should trend that way.

### Proposal 8: Add a server-side invariant for unresolved active hand ownership

In non-WAITING, non-SHOWDOWN, non-STAGED states, assert that one of these is true:

- a connected human is to act and has a deadline
- an automated actor is to act and automation is scheduled
- a lifecycle transition is actively executing

This is stronger than checking only `toActSeat` validity.

### Proposal 9: Shorten browser reconnect ambiguity

The current reconnect grace behavior is useful, but expensive in ambiguity.

Recommendation:
- use a shorter default reconnect grace for browser/mobile clients
- or classify sessions by client type
- or add faster heartbeats for active-hand participants

Goal:
- reduce zombie "connected humans"
- reduce false stall ownership

### Proposal 10: Simplify the status-strip architecture

The status strip should not need to understand so much domain behavior.

Recommendation:
- derive a small controller-level object such as:
  - `tablePhase`
  - `heroPrompt`
  - `pendingResolutionState`
  - `displayNotice`
- make the hook mostly presentational

This lowers the risk that UX polish code becomes a hidden gameplay state machine.

## Suggested Implementation Order

### Phase 1: Contract and reconciliation hardening

- add explicit snapshot action-resolution field
- make client pending-action reconciliation rely on that field
- document authoritative vs display-only snapshot fields

### Phase 2: Server control-plane simplification

- define explicit next-step ownership
- reduce progression entry points
- keep stall monitor as emergency recovery only

### Phase 3: Client state reduction

- reduce status-strip state machine scope
- keep display notices cosmetic
- push more phase derivation into one controller boundary

### Phase 4: Performance and ops cleanup

- move optional enrichments off hot snapshot path if needed
- tighten reconnect/session behavior
- add concise operational dashboards around unresolved active hands

## Client State Simplification Track

Goal:

Make the UI primarily a function of `TABLE_SNAPSHOT` so the client never appears stalled when the server is correct.

This track reduces client-side inference and removes unnecessary state machines.

### Phase 1: Snapshot reconciliation contract

Update the realtime contract so clients reconcile actions using a dedicated snapshot field:

- `resolvedActionId`

Client rule:

- if `snapshot.resolvedActionId === pendingActionId`, clear pending action

This should replace client reliance on:

- `lastAction`
- `lastHandResult`
- inferred hand progression
- turn movement heuristics

Recommendation:

- keep `actionId` as the initiating action identifier when useful for diagnostics
- add `resolvedActionId` as the explicit client reconciliation field

That keeps semantics clean:

- `actionId`: what directly triggered this snapshot, if any
- `resolvedActionId`: the local client action the server has now definitively resolved

### Phase 2: Reduce client state sources

Rendering should derive primarily from:

- `snapshot`
- `connectionStatus`

Not from:

- pending-action store as a gameplay source
- notice derivations as gameplay input
- status-strip phase state machine
- implicit hand-transition inference

Notices should remain cosmetic only.

The core rendering question should become:

"If I only had the latest snapshot and connection status, could I draw the correct table state?"

The answer should be yes.

### Phase 3: Simplify status strip

Replace the current complex strip logic with a controller-derived object such as:

- `tableDisplayState.phase`
- `tableDisplayState.heroPrompt`
- `tableDisplayState.notice`
- `tableDisplayState.transportState`

The status strip component should become mostly presentational.

Target result:

- remove gameplay-domain inference from `useLiveTableStatusStripState`
- reduce local timers and local phase ownership
- keep winner hold, strip text, and animation timing in a thinner display layer

### Phase 4: Separate gameplay state from display events

Snapshots should drive gameplay-visible state:

- cards
- pot
- `toActSeat`
- hand lifecycle
- stack changes

Display events should drive cosmetic presentation:

- notices
- winner banners
- strip text
- animations

Display events must never affect gameplay state.

If a display event is missing, delayed, or duplicated, the table should still render the correct game state from the snapshot alone.

### Phase 5: Remove stale pending-action states

Pending action should be purely temporary:

- client sends action
- pending action stored briefly
- next authoritative snapshot with matching `resolvedActionId` clears it

Do not allow pending action to outlive a resolved snapshot.

This means:

- no long-lived fallback reconciliation against unrelated snapshot metadata
- no UI ownership of "I think the action is still pending" once the server has clearly moved on

### Phase 6: Simplify action notices

`useActionMessages` should:

- read `snapshot`
- produce cosmetic notices

It must not:

- infer state transitions
- reconcile actions
- act as a gameplay-progress authority

`lastAction` and `lastHandResult` are suitable display inputs, but they should stay display-only.

### Phase 7: Shorten reconnect ambiguity

Reconnect handling should be tightened so ghost humans do not keep ownership ambiguous.

Recommended changes:

- shorter reconnect grace windows for browser/mobile sessions
- faster heartbeats for active-hand participants
- clearer server-side ownership reset if a human disappears during an active hand

Goal:

- reduce ghost players
- reduce UI confusion
- reduce mismatch between perceived and actual turn ownership

## Expected Outcome Of This Track

After this work:

- UI reflects server state immediately
- no persistent `Syncing...` or stale action prompts after authoritative progress
- fewer derived state machines
- simpler rendering logic
- easier debugging because most client issues become snapshot issues, not cross-hook inference issues

## Concrete Refactor Target

The practical end state should look like this:

1. Controller receives latest `TABLE_SNAPSHOT` and `connectionStatus`.
2. Controller derives one compact display model.
3. Table components render from that model.
4. Cosmetic notice hooks decorate the experience but never own gameplay truth.
5. Pending-action state is ephemeral and reconciled only by `resolvedActionId`.

That is the cleanest path to rendering stability.

## Concrete Questions To Resolve Before Larger Refactors

1. Should the server support exactly-once client action acknowledgement semantics at the protocol level?
2. Is `requestDrive` intended as a long-term boundary or a transitional one?
3. Are lifecycle plans meant to be the orchestration model, or just a helper pattern?
4. Which snapshot fields are allowed to be absent without changing gameplay correctness?
5. Which client UI states are allowed to persist without a new snapshot?

These should be answered explicitly before more incremental fixes are added.

## Bottom Line

The game engine is not suffering from bad poker logic. It is suffering from orchestration and reconciliation complexity around that logic.

The server should move toward one authoritative progression owner at a time.
The client should move toward snapshot-first rendering with thinner local display state.

If those two simplifications happen, most timeout, stalling, and "syncing forever" bugs become easier to prevent, easier to detect, and easier to fix.
