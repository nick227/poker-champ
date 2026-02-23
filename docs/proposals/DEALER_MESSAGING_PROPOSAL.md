# Dealer Messaging Proposal

## Goal
Make the dealer announce bar deterministic and server-authoritative by streaming the latest accepted action in realtime snapshots, while preserving existing end-of-hand winner messaging.

## Problem
Today `DealerAnnounceBar` can only render:
- Hand result (`handResultMessage`)
- Street/pot fallback
- Waiting state

It cannot reliably narrate each action without brittle client-side inference.

## Proposal Summary
Add a server-authored `lastAction` field to `TABLE_SNAPSHOT` and populate it immediately after each accepted action.  
Client render priority:
1. Active hand + `lastAction` -> show live action narration.
2. `HAND_END` result window -> show existing `handResultMessage`.
3. Otherwise -> street/pot banner (or waiting banner).

## Contract Change
Extend `TableSnapshotPayload` with optional:

```ts
lastAction?: {
  handId: string;
  seq: number; // monotonic per hand
  street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  actorUserId: string;
  actorKind: "HUMAN" | "BOT";
  action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
  amountCents: number;      // chips put in by this action
  raiseToCents?: number;    // set for raise semantics
  potAfterCents: number;
  origin: "PLAYER" | "AUTO" | "FORCED";
  createdAtTs: number;
}
```

Notes:
- Keep optional for backward compatibility.
- Keep `lastHandResult` unchanged.

## Server Design

### State
Add to `PokerState`:
- `handActionSeq: number`

Rules:
- Reset to `0` in `startHand()`.
- Increment exactly once per accepted action.
- Do not reuse `hand.actionCount` for this purpose.

### ActionService boundary
Have `ActionService.execute(...)` return action metadata alongside transition result:

```ts
{
  result: ActionResult;
  lastAction?: TableSnapshotLastAction;
}
```

`lastAction` should be built where action legality/semantics are finalized (inside `ActionService`), using known actor/action/amount/pot/meta values.

### Emission
On every accepted action path (`FOLD`, `CHECK`, `CALL`, `BET`, `RAISE`, `ALL_IN`, forced fold, auto-actions):
- `ActionService` returns `lastAction`.
- Dealer increments `state.handActionSeq` and stamps `lastAction.seq`.
- Dealer passes `lastAction` directly into snapshot emission (`ACTION_ACCEPTED` / `BOT_ACTION`).

### Source of truth
Use accepted-action execution data from `ActionService` / `SettlementService`, not client payload echo.

### Lifecycle and persistence
`lastAction` is ephemeral snapshot decoration:
- Included in emitted snapshots.
- Not persisted to DB.
- Not replayed from storage.
- Not required once newer snapshots supersede it.

## Client Design

### Table screen
- Track last seen action key (`handId + seq`).
- Build announce text from snapshot `lastAction`.
- Avoid replaying duplicate announcements across reconnect/snapshot re-emits.

### DealerAnnounceBar render order
1. If active hand and `lastAction` present -> action narration.
2. Else if `handResultMessage` present -> winner line.
3. Else if hand present -> `{street} - Pot {pot}`.
4. Else waiting line.

### Copy examples
- `Alice folds`
- `Bot_3 checks`
- `Nick calls $40`
- `Rae bets $120`
- `Sam raises to $260`
- `Mina is all-in for $1,180`

## Rollout Plan
1. Add schema field to realtime contract.
2. Update `ActionService` return shape to include `lastAction`.
3. Emit `lastAction` from dealer snapshot path as ephemeral snapshot decoration.
4. Add `handActionSeq` to `PokerState` and stamp `seq` in dealer on accepted actions.
5. Update client announce logic to prefer `lastAction` during active hands.
6. Keep existing `handResultMessage` behavior for hand-end window.
7. Add tests before enabling UI copy refinements.

## Testing

### Contract
- Snapshot with and without `lastAction` validates.

### Engine
- Every accepted action kind populates expected `lastAction`.
- `seq` increments monotonically per hand.
- `startHand()` resets `handActionSeq` to `0`.
- `RAISE` includes `raiseToCents`.
- Auto-action paths set `origin = AUTO`.
- Forced fold paths set `origin = FORCED`.
- Player-initiated paths set `origin = PLAYER`.

### Client
- Announce bar prioritizes `lastAction` over street/pot.
- Hand-end result still displays in result window.
- Duplicate snapshot events do not re-announce same action.
- Reconnect snapshots do not replay already-seen (`handId`, `seq`) messages.

## Risks and Mitigations
- Risk: duplicate announcements from repeated snapshots.
  - Mitigation: dedupe on `handId + sequence`.
- Risk: ambiguity in raise semantics.
  - Mitigation: include both `amountCents` and `raiseToCents`.
- Risk: semantic drift between rules and narration.
  - Mitigation: construct `lastAction` at `ActionService` boundary.
- Risk: schema drift.
  - Mitigation: contract-first change with shared types.

## Non-Goals
- No gameplay rule changes.
- No client-side action inference system.
- No historical replay API in this phase.

## Decision
Proceed with server-authored `lastAction` in `TABLE_SNAPSHOT` as the canonical realtime dealer narration channel, with:
- action metadata generated at `ActionService` boundary
- monotonic `handActionSeq` in `PokerState`
- ephemeral (non-persistent) snapshot decoration semantics
