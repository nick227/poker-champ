# Poker Room Architecture

This folder contains the room orchestration layer for poker.

## Controller Role

- `PokerRoom` is Colyseus glue (lifecycle hooks, state/dealer setup, wiring).
- `PokerRoomController` composes and wires room services.
- Services implement orchestration concerns (join/leave/session/message/lifecycle/features).

## Context Boundary Rule

Services must operate through `PokerRoomContext` and the room facade surface.

Direct access to the following from services is forbidden:

- `room.state`
- `room.clients`
- `room` private fields

Do not reach across the boundary with `as any` casts.

## Service Ownership

- `PokerRoomSessionManager`: session binding + epoch/stale-session protection
- `PokerRoomMessageRouter`: inbound message routing and handler orchestration
- `PokerRoomJoinService`: join orchestration (restore/rejoin/new seat paths)
- `PokerRoomLeaveService`: leave/reconnect/abandonment orchestration
- `PokerRoomLifecycle`: room startup/disposal lifecycle wiring
- `features/PokerRoomPresence`: table presence indexing
- `features/PokerRoomIdleManager`: activity + idle disposal orchestration
- `features/PokerRoomSeatRecovery`: persistent seat bootstrap + cleanup sweeps
- `features/PokerRoomStallMonitor`: stall/queue-depth monitoring orchestration
- `features/PokerRoomBotService`: bot seeding/removal orchestration

## Dealer Boundary

`Dealer` is the authoritative game engine.

Rules:

- Dealer must remain deterministic.
- Network concerns must never leak into Dealer.
- Dealer must not depend on `PokerRoom`.

## Testing

Room orchestration changes must pass this minimum suite:

- `src/tests/session-policy.test.ts`
- `src/tests/table-join.guard.test.ts`
- `src/tests/table-action-broadcast.test.ts`
- `src/tests/poker-room.reconnect-timeout.test.ts`

## Design Principle

- `PokerRoom` = networking
- Services = orchestration
- `Dealer` = game engine

