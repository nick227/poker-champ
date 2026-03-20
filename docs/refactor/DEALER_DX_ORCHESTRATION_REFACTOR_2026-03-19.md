# Dealer DX Orchestration Refactor

Date: 2026-03-19
Primary target: `apps/server/src/engine/Dealer.ts`

## Objective

Refactor `Dealer.ts` into a developer-friendly orchestration layer that is easy to read top-down:

1. public room-facing commands
2. action intake
3. progression driving
4. snapshot and automation triggers
5. disposal

The file should coordinate existing engine services, not re-implement their internal logic.

## Current Baseline

`Dealer.ts` is currently about 2,729 lines and still mixes orchestration with detailed runtime management.

Existing extractions already in place:

- `ActionService`
- `SettlementService`
- `HandLifecycleService`
- `TurnAutomationService`
- `PlayerLifecycleService`
- `SnapshotService`
- `TurnManager`
- `HandOrchestrator`
- `LifecycleExecutor`
- `DisconnectManager`
- `HandContext`
- `dealer/decision/*`

That means this is not a greenfield refactor. The safe path is to finish the boundary cleanup around the seams that already exist.

## What Still Makes Dealer Hard To Work In

Even after the service split, `Dealer.ts` still directly owns too many detailed concerns:

- public player and connection commands
- action orchestration and post-action reconciliation
- progression driving and queue re-drive logic
- timer and automation entrypoints
- diagnostic emission and invariant logging
- lifecycle plan batching for external player events
- hand transition ownership reconciliation
- self-healing and repair paths
- a long constructor with many inline callbacks

The result is that a contributor still has to scan one large file to answer simple questions like:

- Who advances the hand after an action?
- Who owns `nextStepOwner` reconciliation?
- Which path is allowed to emit snapshots?
- Which state repairs are observational vs mutating?

## Target End State

`Dealer.ts` should become the engine's orchestration facade, not the engine's implementation dump.

Target traits:

- `Dealer` keeps the current public API so `PokerRoom` does not need a broad rewrite.
- `Dealer` remains the single place that crosses service boundaries.
- Detailed logic moves into small orchestration collaborators with narrow deps.
- Existing domain services keep owning gameplay, settlement, snapshot, and lifecycle rules.
- No new god-object context should be introduced early.

In practice, opening `Dealer.ts` should show a short file with:

- field declarations for core state and collaborators
- constructor wiring
- room-facing methods like `addPlayer`, `removePlayer`, `handleAction`
- thin delegations into orchestration collaborators
- `dispose`

## Refactor Principles

### 1. Preserve the external surface first

Keep these stable while refactoring:

- `new Dealer(...)`
- room-facing methods already used by `PokerRoom`
- snapshot reasons and emission timing
- `PokerError` codes
- current serialized mutation boundary

### 2. Extract behavior, not ownership, in the first passes

Do not start by moving all mutable fields into a giant `DealerContext`.

First move behavior behind narrow collaborators. Only extract shared runtime containers after the real boundaries are obvious.

### 3. Use existing seams before inventing new ones

Prefer building on:

- `TurnManager` for queue and timeout infrastructure
- `HandOrchestrator` for next-hand scheduling and terminal flow bridging
- `LifecycleExecutor` for plan execution
- `HandContext` for hand-scoped state
- `dealer/decision/*` for progression state projection

### 4. No behavior changes in structure PRs

Each PR should be either:

- mechanical extraction and call-site switch
- test coverage expansion
- behavior change

Do not mix them.

### 5. Plan for tournaments by keeping the engine policy-light

Future tournament support should influence this refactor, but only as a boundary constraint.

That means:

- `Dealer` should remain a deterministic single-table engine
- tournament scheduling should not move into `Dealer`
- cross-table concerns should not move into `Dealer`
- cash-game-specific room policies should not define the long-term `Dealer` API

The goal is not to make `Dealer` tournament-aware now.

The goal is to avoid making `Dealer` cash-room-specific in ways that would block a future tournament layer.

## Tournament Compatibility Constraints

This refactor should assume a future system may need:

- blind level updates at safe hand boundaries
- player elimination handling
- tournament table balancing and table breaks
- late registration and seat assignment from a higher-level coordinator
- different leave, rebuy, cashout, and bot rules than cash games
- prize payout and tournament-state progression outside the table engine

Those are not reasons to move tournament logic into `Dealer`.

They are reasons to keep `Dealer` focused on:

- running one table
- enforcing hand and turn rules
- exposing clear table-level commands
- accepting externally supplied table configuration changes at safe boundaries

Examples of good future-friendly boundaries:

- "update blinds for the next hand"
- "seat this player at this table"
- "remove this player at a safe boundary"
- "disable cash-game-only features for this table mode"

Examples of bad boundaries:

- "advance tournament level"
- "rebalance tournament tables"
- "calculate tournament payouts"
- "manage tournament registration state"

## Proposed Dealer Shape

The safest target is a thin `Dealer` plus a small set of orchestration collaborators under `apps/server/src/engine/dealer/orchestration/`.

Suggested collaborators:

### `DealerActionOrchestrator`

Owns:

- `handleAction` pipeline internals
- `_handleAction`
- `applyActionResult`
- post-action lifecycle reconciliation
- preflop action bookkeeping hooks

Dependencies:

- `PokerState`
- `HandContext`
- `ActionService`
- `TurnManager`
- snapshot trigger callback
- drive callback
- selected reconciliation helpers

Why first:

- the action pipeline is already conceptually separate
- it has strong tests
- it shrinks the highest-friction part of `Dealer.ts`

### `DealerProgressionCoordinator`

Owns:

- `driveGame`
- `driveGameOnce`
- `requestDrive`
- `queueDrive`
- next-step ownership reconciliation
- progression self-heal hooks
- decision logging bridge

Dependencies:

- `PokerState`
- `TurnManager`
- `HandOrchestrator`
- `TurnAutomationService`
- `HandLifecycleService`
- `SettlementService`
- decision helpers

Why second:

- it isolates the most important orchestration rule in the system: who drives next
- it removes the densest cluster of state-machine code from `Dealer.ts`

### `DealerPlayerCommandGateway`

Owns:

- `addPlayerInternal`
- `restorePlayerFromSessionInternal`
- `removePlayerInternal`
- `removeBotInternal`
- `markAbandonedInternal`
- `setPlayerSittingOutInternal`
- staging and flushing external player lifecycle batches

Dependencies:

- `PokerState`
- `PlayerLifecycleService`
- `LifecycleExecutor`
- hand-advancing callback
- persistence callback

Why third:

- public player commands become thin wrappers
- lifecycle plan batching gets isolated from action/progression code

### `DealerDiagnostics`

Owns:

- diagnostic listener registration
- `emitDiagnostic`
- `buildDiagnosticContext`
- invariant and observation logging helpers

Examples:

- progression ownership invariant logs
- waiting-state invariant logs
- to-act derivation warnings
- lifecycle deferred-removal diagnostics

Why fourth:

- low behavior risk
- removes a large volume of observational code from the main file

## What Should Stay In Dealer

Even after the refactor, `Dealer` should keep:

- the public API consumed by `PokerRoom`
- construction and collaborator wiring
- final ownership of `PokerState`
- final ownership of core service instances
- final ownership of disposal order

This keeps the engine boundary clear:

- `PokerRoom` talks to `Dealer`
- `Dealer` coordinates engine collaborators
- domain services remain framework-agnostic

## PokerRoom Boundary

`PokerRoom.ts` should be considered during this refactor, but mostly as a boundary check, not as a co-refactor target.

Current room architecture already describes the intended split:

- `PokerRoom` = networking and room orchestration
- `Dealer` = authoritative game engine

That means this `Dealer` refactor should not absorb room concerns like:

- client/session binding
- message routing
- lobby metadata
- idle disposal
- room presence
- reconnect transport behavior

At the same time, `PokerRoom` shows where current cash-game policy lives today, including:

- persistent seat cleanup
- idle empty-room disposal
- bot seeding and bot removal policy
- snapshot log persistence hooks

Those policies are likely to differ for tournaments, so they should remain outside `Dealer` or move into room-level or future tournament-level orchestration, not into the engine.

## Future Tournament Coordinator Boundary

The intended long-term split should be:

- `Dealer`: one-table gameplay engine
- `PokerRoom`: real-time room and transport orchestration
- future tournament coordinator: multi-table tournament policy and scheduling

A future tournament coordinator would own concerns such as:

- blind schedules across rounds
- table balancing and movement between rooms
- elimination tracking
- tournament registration and start flow
- break scheduling
- payout ladder execution

It may drive `PokerRoom` and `Dealer`, but `Dealer` should not become that coordinator.

## Safe Extraction Order

### Phase 0. Lock The Baseline

Before moving code, rely on the existing regression coverage around:

- `apps/server/src/engine/dealer.rule-decisions.test.ts`
- `apps/server/src/engine/dealer.lifecycle-owner.reconciliation.test.ts`
- `apps/server/src/engine/dealer.auto-action-warning.regression.test.ts`
- `apps/server/src/engine/dealer.hand-terminal-idempotence.test.ts`
- `apps/server/src/engine/dealer.action-result.reconciliation.test.ts`
- `apps/server/src/tests/integration/hand-lifecycle.integration.test.ts`
- `apps/server/src/tests/integration/dealer.random-walk.soak.test.ts`

Add new characterization tests only where extraction would otherwise force reading private internals.

### Phase 1. Extract Diagnostics First

Move pure observational helpers out of `Dealer.ts`:

- diagnostic listener handling
- context building
- invariant logging
- state-warning loggers

This is the lowest-risk reduction because it should not change mutation order.

Expected result:

- `Dealer.ts` loses a large amount of log-only code
- behavior remains identical

## Phase 1 Validation Gate

Temporary gate due to baseline regression failures:

- `apps/server/src/engine/dealer.action-result.reconciliation.test.ts`
- `apps/server/src/engine/dealer.to-act-needs-action.repair.test.ts`
- single-table soak: `apps/server/src/tests/integration/dealer.random-walk.soak.test.ts`

Repository commands:

```text
pnpm server:typecheck
pnpm dealer:gate
pnpm test:server:soak
```

Full regression coverage is currently red on baseline `HEAD` and is not used as the Phase 1 refactor gate.

Phase 1 extraction rule:

- keep call-site delegation strict
- do not move drive boundaries yet
- treat green gate plus soak as the refactor safety bar until the broader suite is stabilized

### Phase 2. Extract Action Orchestration

Move the action path into `DealerActionOrchestrator`.

Scope:

- `handleAction`
- `_handleAction`
- `applyActionResult`
- `reconcilePostActionLifecycleIfNeeded`
- preflop tracking helpers used only by the action path

Guardrail:

- keep queue ownership in `TurnManager`
- keep public `Dealer.handleAction(...)` signature unchanged

Expected result:

- `Dealer.ts` only forwards action requests and exposes the public boundary

### Phase 3. Extract Progression Driving

Move the drive loop and recovery logic into `DealerProgressionCoordinator`.

Scope:

- `driveGame`
- `driveGameOnce`
- `requestDrive`
- `queueDrive`
- repair hooks that exist only to support progression
- `nextStepOwner` reconciliation

Guardrail:

- do not change the current meaning of `nextStepOwner`
- do not move decision projection logic out of `dealer/decision/*`

Expected result:

- the most state-machine-heavy code is no longer in `Dealer.ts`

### Phase 4. Extract Player Command Internals

Move non-action player lifecycle internals into `DealerPlayerCommandGateway`.

Scope:

- internal player and bot lifecycle methods
- pending external lifecycle batch staging
- seat release bridging
- hand-advance-after-removal bridge

Guardrail:

- keep public methods like `addPlayer`, `removePlayer`, `markDisconnectedSerialized` on `Dealer`
- avoid changing room call sites

Expected result:

- room-facing API remains stable
- player lifecycle logic stops competing with the action and progression code for space

### Phase 5. Thin The Constructor Last

Only after the runtime boundaries settle, introduce a small factory such as:

- `createDealerServices(...)`
- `createDealerOrchestration(...)`

Do not do this first.

If done too early, the factory becomes another unreadable wiring blob and freezes bad boundaries into place.

### Phase 6. Review Table-Mode Assumptions

Before calling the refactor complete, audit the new `Dealer` surface for cash-only assumptions.

Focus on:

- cashout-driven removal flows
- bot assumptions
- seat persistence assumptions
- leave semantics
- buy-in and rebuy policy assumptions exposed as engine contracts

The output of this phase should be a short follow-up list of boundaries that must stay room-level or move to a future tournament-level service.

## Proposed Folder Additions

```text
apps/server/src/engine/dealer/orchestration/
  DealerActionOrchestrator.ts
  DealerProgressionCoordinator.ts
  DealerPlayerCommandGateway.ts
  DealerDiagnostics.ts
  index.ts
```

This keeps the split explicit:

- `dealer/hand/*` for hand-domain services
- `dealer/turn/*` for turn-domain services
- `dealer/settlement/*` for settlement-domain services
- `dealer/orchestration/*` for the code that still needs to coordinate those domains

## Things To Avoid

Do not do these in the first pass:

- rename `Dealer.ts` or replace the class with a new public type
- create a giant mutable `DealerContext` with every field and callback
- merge domain services together again behind an orchestration facade
- change `PokerRoom` wiring and engine refactor shape in the same PR
- move snapshot, settlement, or rules math back into `Dealer`

## Acceptance Criteria

The refactor is successful when all of these are true:

- `Dealer.ts` is short enough to read in one pass
- the top of the file describes the orchestration flow clearly
- public room-facing methods are thin
- drive-loop code is not mixed with player lifecycle plumbing
- diagnostics are not interleaved with core mutation code
- existing integration and soak coverage stays green

## Recommended First PR

The first safe PR should do only this:

1. add this document
2. extract `DealerDiagnostics`
3. switch `Dealer.ts` to use it
4. run the dealer regression subset

That produces immediate DX improvement with minimal regression risk and sets up the later action and progression extractions cleanly.

## Summary

The safe refactor is not "rewrite Dealer again."

It is:

1. keep `Dealer` as the public engine facade
2. keep existing domain services in place
3. extract the remaining orchestration-heavy method clusters into small collaborators
4. thin the file only after the boundaries prove themselves

That path gets `Dealer.ts` to a real DX orchestration layer without destabilizing the current engine.
