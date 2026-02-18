# Dealer Refactor Plan

## Objective
Refactor `src/engine/Dealer.ts` into a clean, developer-friendly orchestrator that coordinates focused services instead of owning all gameplay, persistence, automation, and snapshot responsibilities directly.

## Current State Summary
`Dealer.ts` is currently ~1361 lines and mixes many domains:
- Seat lifecycle and player/session management (`addPlayer`, `removePlayer`, reconnect/disconnect, abandon).
- Action intake, validation, and action queue serialization.
- Hand lifecycle (start hand, street progression, showdown, hand end scheduling).
- Betting/pot/chip mutations.
- Persistence concerns (hand history, ledger/cashier, payouts, hand finalization).
- Bot + disconnected auto-action behavior.
- Snapshot construction and emission.
- Seat iteration/navigation utilities.
- Runtime calculations refresh (`HandCalculationsCoordinator`).

This makes the file hard to reason about, hard to test in isolation, and risky to change.

## Current Implementation Status
- Completed: `TableNavigator`, `ActionService`, `SettlementService`, `HandLifecycleService`, `SnapshotService`, `TurnAutomationService`, `PlayerLifecycleService` extractions.
- Completed: explicit staged runout phase (`PokerState.runoutMode`) with hard action/bot guards.
- Completed: shared timing constants in `src/engine/dealer/timing.ts`.
- Completed: invariants guardrails in `src/engine/invariants/assertState.ts`.
- In progress: final `Dealer` orchestration cleanup and method ownership documentation.

## Current Dealer Method Ownership
- `Dealer.handleAction` / queue: serialization boundary only.
- `Dealer._handleAction` + `applyActionResult`: orchestration only (no rules math).
- `Dealer.startHand` / `advanceStreetOrShowdown` / `finishHand*`: dispatch to `HandLifecycleService` plans.
- `Dealer.executeHandLifecyclePlans` / `executePlayerLifecyclePlans`: plan runner only.
- `Dealer.scheduleNextHand`: orchestration timer only.
- `Dealer.maybeActForBot`: delegates to `TurnAutomationService`.

## Refactor Goals
- Keep `Dealer` as a thin orchestration layer with explicit collaborators.
- Isolate business logic by domain so each unit has one reason to change.
- Make action flow easier to trace and test.
- Preserve existing runtime behavior, wire protocol, and persistence semantics.
- Reduce regression risk by using incremental extraction (not a big-bang rewrite).

## Non-Goals
- Changing gameplay rules or table product behavior.
- Changing snapshot schema or message contract.
- Introducing new async/event frameworks.
- Replacing current persistence providers.

## Target Architecture

### 1) `Dealer` (Orchestrator)
Responsibilities:
- Public API called by room layer (`add/remove player`, `handleAction`, reconnect/disconnect hooks).
- Action serialization boundary (queue/mutex).
- Lifecycle coordination between extracted services.
- Final decision points for when to emit snapshots and when to start next hand.

`Dealer` should not contain detailed action semantics, payout math, snapshot assembly, or persistence record composition.

### 2) `PlayerLifecycleService`
Extract from current seat/player flows:
- Join/restore/bot add/remove.
- Disconnect/reconnect/abandon transitions.
- Seat release and hand-safe removal handling.
- Buy-in/cash-out orchestration hooks.

Inputs:
- `PokerState`, cashier/persistence adapters, logger.

Outputs:
- Structured lifecycle results (for orchestrator to decide snapshot reason + next action).
- Example contract:

```ts
type PlayerLifecycleResult =
  | { kind: "SEATED" }
  | { kind: "RECONNECTED" }
  | { kind: "REMOVED" }
  | { kind: "FORCE_FOLDED" }
  | { kind: "NO_OP" };
```

### 3) `HandLifecycleService`
Extract hand progression logic:
- `startHand`, `advanceStreetOrShowdown`, `runoutToRiver`.
- `finishHandByLastStanding`, `finishHandShowdownWithSidePots`.
- Next hand scheduling and trigger points.

Dependencies:
- Rule helpers (`BettingRound`, `SidePotManager`).
- Deck adapter.
- Settlement/persistence adapters.

### 4) `ActionService`
Extract `_handleAction` switch and action-level validation/mutations:
- Preconditions (turn, eligibility, hand running).
- `CHECK/CALL/BET/RAISE/ALL_IN/FOLD` semantics.
- Bet-level/min-raise updates and reopen rules.
- Strongly typed action result contract:

```ts
type ActionResult =
  | { kind: "HAND_FINISHED" }
  | { kind: "STREET_COMPLETE" }
  | { kind: "TURN_ADVANCED" }
  | { kind: "WAITING_FOR_PLAYERS" }
  | { kind: "NO_OP" }; // e.g. duplicate actionId
```

Important: maintain exact behavior for all-in/min-raise edge cases.

### 5) `SettlementService`
Extract chip and payout mechanics:
- Debit application to runtime state.
- Side pot payout distribution.
- Payout and hand-finalization persistence writes.

Constraint:
- `SettlementService` must not decide when to pay, only how to pay.
- `HandLifecycleService` decides terminal flow (`SHOWDOWN` vs `ALL_FOLDED`).
- `SettlementService` executes commands: `computeSidePots()`, `computeWinners()`, `applyPayouts()`, `persistPayouts()`.

Goal: one place that guarantees chip accounting invariants.

### 6) `SnapshotService`
Extract snapshot concerns:
- Build hero/table snapshot payload.
- Compute state hash.
- Validate payload schema.
- Emit to single/all users.
- Trigger optional snapshot persistence callback.
- Own `HandCalculationsCoordinator` (presentation calculations only).

`Dealer` only calls `snapshotService.emit*` with reason/action context.

Constraint:
- `SnapshotService` is read-only over `PokerState` and must never mutate gameplay state.

### 7) `TurnAutomationService`
Extract:
- `maybeActForBot`, internal queued auto-action behavior.
- reconnect-safe skip behavior.
- disconnected auto-action hand-cap tracking.

This keeps human action path and automated action path separated and testable.

### 8) `TableNavigator` (Pure utility module)
Extract seat navigation/count methods:
- seat iteration order.
- find next occupied/active/to-act seat.
- count variants (`non-out`, `active humans`, `not folded`).

Pure functions over state reduce hidden coupling and improve unit test quality.

### 9) `ValidationService` (Optional, later phase)
Extract reusable validation/guards:
- `assertCanAfford`
- `assertValidBuyIn`
- shared typed error mapping helpers

Goal:
- Keep `ActionService` focused on betting semantics.
- Centralize error code behavior and guard consistency.

## State Mutation Ownership

| Area | Owner |
| --- | --- |
| Player status / seats | `PlayerLifecycleService` |
| Betting fields (`roundCurrentBetCents`, `minRaiseCents`, `needsAction`) | `ActionService` |
| Street, board, dealerSeat, handId | `HandLifecycleService` |
| Stack / committed / pot | `SettlementService` |
| Snapshot read-only projection | `SnapshotService` |
| `toActSeat` movement | `ActionService` / `HandLifecycleService` |
| `connected` / `disconnectDeadlineTs` | `PlayerLifecycleService` |

## Golden Rules
- No service calls another service directly.
- All cross-service coordination flows through `Dealer`.
- Services may accept `PokerState` but must never retain it.
- No service may call `client.send` or access network primitives.

## Recommended Folder Layout

`src/engine/dealer/`
- `Dealer.ts` (orchestrator only)
- `DealerTypes.ts` (shared domain/result types)
- `services/PlayerLifecycleService.ts`
- `services/ActionService.ts`
- `services/HandLifecycleService.ts`
- `services/SettlementService.ts`
- `services/SnapshotService.ts`
- `services/TurnAutomationService.ts`
- `services/ValidationService.ts` (optional, later)
- `utils/TableNavigator.ts`
- `utils/DealerGuards.ts` (small reusable assertions)

## Orchestrator Sequence

```text
PokerRoom
  -> Dealer.handleAction
     -> ActionService.execute
        -> SettlementService.applyDebit
     <- ActionResult
     -> HandLifecycleService.maybeAdvance
     -> SnapshotService.emitAll
     -> TurnAutomationService.maybeAct
```

## Incremental Execution Plan

### Phase 0: Baseline Safety Net
- Add characterization tests around current behavior before moving code.
- Prioritize flows documented in `docs/BETTING_FLOW.md`:
  - join/rejoin/remove/disconnect.
  - action legality and betting transitions.
  - all-in reopen behavior.
  - showdown/side-pot outcomes.
  - snapshot contract invariants.

Deliverable:
- Stable baseline test suite proving current semantics.

### Phase 1: Pure Utility Extraction (Low Risk)
- Extract seat/count/navigation helpers to `TableNavigator` pure module.
- Replace direct private methods with module calls.
- Keep signatures simple, no behavior changes.

Deliverable:
- Smaller `Dealer.ts` + utility unit tests.

### Phase 2: Snapshot Extraction
- Move `updateCurrentHandCalculations`, snapshot builders, and emit methods into `SnapshotService`.
- Keep payload byte-for-byte equivalent (except non-deterministic IDs/timestamps).
- Preserve schema validation and callback side effects.

Deliverable:
- `Dealer` delegates all snapshot concerns.

### Phase 3: ActionService Extraction
- Move `_handleAction` switch and related guards/branches into `ActionService.execute(...)`.
- Return explicit `ActionResult` discriminated union (`HAND_FINISHED`, `STREET_COMPLETE`, `TURN_ADVANCED`, `WAITING_FOR_PLAYERS`, `NO_OP`).
- Keep serialization queue in `Dealer`.

Deliverable:
- Action rules isolated and independently testable.

### Phase 4: Settlement + Persistence Write Extraction
- Move debit/apply/payout persistence methods into `SettlementService`.
- Keep existing call sites and order of operations unchanged.
- Add invariant checks in tests:
  - pot equals sum of contributions minus payouts during hand.
  - no negative stacks.
  - action/payout index monotonicity.

Deliverable:
- Isolated settlement mechanics with focused tests.

### Phase 5: HandLifecycleService Extraction
- Move `startHand`, street advancement, showdown/last-player finishing, schedule-next-hand paths.
- Keep hand transition ordering and snapshot reason mapping stable.

Deliverable:
- Dealer orchestrates hand lifecycle by calling a service.

### Phase 6: PlayerLifecycle + Automation Extraction
- Move seat lifecycle and auto-action behavior into dedicated services.
- Ensure reconnect race behavior remains identical (queued auto-action skip).

Deliverable:
- `Dealer` reduced to orchestration and wiring.

### Phase 7: Final Cleanup
- Remove obsolete private fields/methods from `Dealer`.
- Consolidate duplicated guard logic into small helper modules.
- Optionally extract `ValidationService` for shared assertions and error code consistency.
- Document architecture and method ownership.

Deliverable:
- Clean, maintainable orchestrator file with clear collaborators.

## Testing Strategy

### Characterization Tests (must-have)
- Action validation matrix by street + call amount + stack depth.
- Min-raise / all-in reopen edge cases.
- Heads-up blind/button and first-to-act transitions.
- Side-pot resolution and payout totals.
- Disconnect auto-action and reconnect cancellation.
- Duplicate `actionId` idempotency in same hand.

### Contract Tests
- `TABLE_SNAPSHOT` schema validity per reason.
- Required invariants:
  - `hero.actionOptions` legality matches turn state.
  - `stateHash` updates when logical state changes.
  - no leaking of other players' hole cards.

### Regression Gates
- No change in persisted action/payout ordering.
- No change in `PokerError` codes for existing rejection paths.
- No change in snapshot reason timing where tests explicitly require it.

## Migration Constraints and Guardrails
- Preserve external `Dealer` public API initially to avoid touching `PokerRoom` until final cleanup.
- Keep extraction steps small and commit-ready.
- Do not mix behavior changes with structural moves.
- When moving logic, prefer copy-then-switch-then-delete to reduce outage risk.

## Risks and Mitigations
- Risk: behavior drift in all-in/raise semantics.
  - Mitigation: dedicated characterization tests before extraction.
- Risk: snapshot shape drift.
  - Mitigation: snapshot contract tests + schema validation unchanged.
- Risk: persistence ordering bugs.
  - Mitigation: integration tests asserting actionIndex/payoutIndex ordering.
- Risk: race regressions with queue + auto-actions.
  - Mitigation: tests for reconnect-before-auto-action and state-change skips.

## Definition of Done
- `Dealer.ts` acts primarily as coordinator/wiring.
- Domain services own their bounded logic with focused unit tests.
- Existing integration behavior remains green.
- `docs/BETTING_FLOW.md` remains accurate or is updated with ownership boundaries.
- New contributors can trace action lifecycle by reading orchestrator + service interfaces without scanning 1k+ LOC.

## Suggested First PR Scope
1. Add characterization tests for current critical action/hand/snapshot behaviors.
2. Extract `TableNavigator` pure helpers.
3. Extract `SnapshotService` (highest readability gain, relatively low behavioral risk).

This gives immediate maintainability improvements while keeping the highest-risk gameplay logic unchanged for later PRs.
