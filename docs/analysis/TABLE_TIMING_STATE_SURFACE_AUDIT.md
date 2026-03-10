# Table Timing State Surface Audit

Date: 2026-03-10  
Scope: Phase 0 pre-implementation audit for deterministic decision engine wiring.

## Files Audited

- `apps/server/src/engine/Dealer.ts`
- `apps/server/src/engine/dealer/turn/TurnManager.ts`
- `apps/server/src/engine/dealer/turn/TurnAutomationService.ts`
- `apps/server/src/engine/dealer/hand/HandLifecycleService.ts`
- `apps/server/src/rooms/PokerRoom.ts`
- `apps/server/src/state/PokerState.ts`
- `apps/server/src/state/PlayerState.ts`

## Decision Input Coverage

| Decision field | Present now | Source |
|---|---|---|
| `tableId` | Yes | `PokerState.tableId` |
| `handId` | Yes | `PokerState.handId` |
| `street` | Yes | `PokerState.street` |
| `toActSeat` | Yes | `PokerState.toActSeat` |
| `players[].id` | Yes | `PlayerState.id` |
| `players[].seat` | Yes | `PlayerState.seat` |
| `players[].kind` | Yes | `PlayerState.kind` |
| `players[].status` | Yes | `PlayerState.status` |
| `players[].needsAction` | Yes | `PlayerState.needsAction` |
| `players[].connected` | Yes | `PlayerState.connected` |
| `players[].connectionState` | No (explicit enum) | Not modeled yet; currently represented by `connected + disconnectDeadlineTs` |
| `hand.turnDeadlineMs` | No | Current timeout authority is timer-based (`TurnManager` keeps `turnStartedAt`) |

## Findings

1. Runtime state already exposes enough fields for initial decision orchestration (`tableId`, hand, actor seat, player actionability/connection).
2. Explicit connection enum and explicit `turnDeadlineMs` are not present yet; those are Phase 4/6 migrations.
3. Existing timeout model stores `turnStartedAt` in `TurnManager`, not in `PokerState`.
4. `PokerRoom` stall monitor can project runtime state for `getStallReason` without changing gameplay.

## Phase 0 Projection Decision

- Keep `stateProjection.ts` as a boundary utility.
- In Phase 0, projection may map directly from runtime fields with minimal transformation.
- Do not migrate runtime state shape yet.

## Gaps Deferred to Later Phases

- Add explicit `turnDeadlineMs` authority (Phase 4).
- Add explicit `connectionState` model (Phase 6).
