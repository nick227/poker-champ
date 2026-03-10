# Table Timing Phase 0 Implementation Checklist

Date: 2026-03-10  
Related proposal: `docs/proposals/TABLE_TIMING_HARDENING_PROPOSAL.md`

## Goal

Complete Phase 0 only: define decision-module boundaries, state-shape compatibility, and integration points without changing gameplay behavior.

## Scope Rules

- Do not change live progression semantics in Phase 0.
- Do not duplicate poker rules in the decision module.
- If runtime state is sufficient, use it directly; only add projection if fields are missing.

## File-by-File Tasks

### 1) Add decision module skeleton

Create directory:

- `apps/server/src/engine/dealer/decision/`

Add files:

- `apps/server/src/engine/dealer/decision/types.ts`
- `apps/server/src/engine/dealer/decision/engineQueries.ts`
- `apps/server/src/engine/dealer/decision/stateProjection.ts`
- `apps/server/src/engine/dealer/decision/computeNextStep.ts`
- `apps/server/src/engine/dealer/decision/getStallReason.ts`
- `apps/server/src/engine/dealer/decision/index.ts`

Checklist:

- [ ] `types.ts` defines `DecisionState`, `EngineStep`, `StallReason`.
- [ ] `engineQueries.ts` exposes query helpers that wrap existing services/rules.
- [ ] `stateProjection.ts` exports `projectDecisionState(...)`.
- [ ] `computeNextStep.ts` and `getStallReason.ts` are pure and accept `(state, now)`.
- [ ] `index.ts` exports all decision-module public symbols.

Suggested stub signatures:

```ts
// types.ts
export type EngineStep =
  | "WAIT_FOR_HUMAN"
  | "RUN_BOT_ACTION"
  | "AUTO_ACTION_TIMEOUT"
  | "ADVANCE_STREET"
  | "RUN_SHOWDOWN"
  | "START_NEXT_HAND"
  | "NO_OP";

export type StallReason =
  | "INVALID_TO_ACT"
  | "BOT_OVERDUE"
  | "TURN_TIMEOUT_OVERDUE"
  | "STREET_ADVANCE_OVERDUE"
  | "SHOWDOWN_OVERDUE";

export type DecisionState = {
  tableId: string;
  players: Array<{
    id: string;
    seat: number;
    kind: "HUMAN" | "BOT";
    status: "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT" | "ABANDONED";
    connected?: boolean;
    connectionState?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "GONE";
    needsAction: boolean;
  }>;
  hand?: {
    handId: string;
    street: "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
    toActSeat: number;
    turnDeadlineMs?: number;
  };
};
```

```ts
// engineQueries.ts
export type EngineQueries = {
  getToActPlayer: (state: DecisionState) => DecisionState["players"][number] | undefined;
  bettingClosed: (state: DecisionState) => boolean;
  showdownRequired: (state: DecisionState) => boolean;
  botActionDue: (state: DecisionState, now: number) => boolean;
  humanTurnExpired: (state: DecisionState, now: number) => boolean;
};

export function createEngineQueries(): EngineQueries {
  // TODO: wrap existing runtime services/rules; no duplicated poker rule logic.
  throw new Error("not implemented");
}
```

```ts
// computeNextStep.ts
export function computeNextStep(state: DecisionState, now: number): EngineStep {
  // TODO: pure orchestration decision only.
  return "NO_OP";
}

// getStallReason.ts
export function getStallReason(state: DecisionState, now: number): StallReason | null {
  // TODO: pure stall diagnosis only.
  return null;
}
```

### 2) Export decision module from dealer index

File:

- `apps/server/src/engine/dealer/index.ts`

Checklist:

- [ ] Export decision module entry points from `index.ts`.

Suggested additions:

```ts
export * from "./decision/index.js";
```

### 3) Audit runtime state surface (documented)

Primary files to inspect:

- `apps/server/src/engine/Dealer.ts`
- `apps/server/src/engine/dealer/turn/TurnManager.ts`
- `apps/server/src/engine/dealer/turn/TurnAutomationService.ts`
- `apps/server/src/engine/dealer/hand/HandLifecycleService.ts`
- `apps/server/src/rooms/PokerRoom.ts`

Checklist:

- [ ] Confirm availability of hand fields: `handId`, `street`, `toActSeat`.
- [ ] Confirm player fields: `kind`, `status`, `connected`, `needsAction`, `seat`.
- [ ] Confirm timeout/deadline source currently used.
- [ ] Record gaps requiring projection or new fields.

Output artifact:

- [ ] Add a short audit note in `docs/analysis/` (for example `TABLE_TIMING_STATE_SURFACE_AUDIT.md`).

### 4) Projection decision gate

Files:

- `apps/server/src/engine/dealer/decision/stateProjection.ts`
- `apps/server/src/rooms/PokerRoom.ts` (or room feature wrapper that runs stall checks)

Checklist:

- [ ] If runtime shape is sufficient, `stateProjection.ts` returns direct/near-direct mapping.
- [ ] If runtime shape is not sufficient, projection fills decision-state contract explicitly.
- [ ] `PokerRoom` can construct decision-state for `getStallReason(...)` call site.

Constraint:

- [ ] Do not put room-specific branching logic into decision module.

### 5) Introduce requestDrive placeholder boundary in Dealer

File:

- `apps/server/src/engine/Dealer.ts`

Checklist:

- [ ] Add `requestDrive(reason: string, now?: number): Promise<void> | void` placeholder.
- [ ] Capture `now` once in this boundary (if omitted, assign `Date.now()` once).
- [ ] Keep existing execution paths unchanged in Phase 0 (no authoritative switch yet).

Suggested stub:

```ts
private requestDrive(reason: string, now?: number): void {
  const driveNow = now ?? Date.now();
  void reason;
  void driveNow;
  // TODO: Phase 7 authority path.
}
```

### 6) Phase 0 tests (non-behavioral)

Add lightweight tests:

- `apps/server/src/engine/dealer/decision/__tests__/decision-shape.test.ts`
- `apps/server/src/engine/dealer/decision/__tests__/state-projection.test.ts`

Checklist:

- [ ] `computeNextStep` and `getStallReason` are callable as pure functions.
- [ ] Projection outputs fields required by `DecisionState`.
- [ ] No runtime behavior changes asserted yet.

## Acceptance Criteria

- [ ] Decision module files exist and compile.
- [ ] `engineQueries.ts` is adapter-only (no duplicated poker rules).
- [ ] State-surface audit is documented.
- [ ] Projection policy (direct vs projection) is decided and implemented.
- [ ] `Dealer` has `requestDrive` boundary placeholder with single `now` capture semantics.
- [ ] Test suite and typecheck pass.

## Verification Commands

```powershell
pnpm --dir apps/server typecheck
pnpm --dir apps/server test -- src/engine/dealer/decision/__tests__
pnpm --dir apps/server test -- src/tests/integration/hand-lifecycle.integration.test.ts
```

## Rollback (Phase 0)

- Remove/ignore decision module wiring points.
- Keep current orchestration and stall logic paths active.
- Preserve audit doc for future retry.
