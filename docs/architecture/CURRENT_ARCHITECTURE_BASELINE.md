# Current Architecture Baseline (Live Multiplayer)

This document describes the **current as-built structure** relevant to `docs/roadmaps/LIVE_MULTIPLAYER_ROADMAP.md`.

## 1) Monorepo Structure

## Root workspaces
- `apps/*`
- `packages/*`

## Relevant packages/apps
- `src/` -> backend server + Colyseus rooms + poker engine
- `apps/client/` -> Expo client (web/mobile/desktop)
- `packages/realtime-contract/` -> shared Zod schemas for realtime
- `packages/sdk/` -> OpenAPI-generated REST SDK

## Tooling/quality gates
- Root verify command: `pnpm verify`
- Includes SDK generation/check, client tests, realtime/server/client type checks, and no-direct-fetch UI check.

## 2) Runtime Topology (Current)

## Single server process
- `src/index.ts` runs:
1. Express REST API (`/api/*`)
2. Colyseus realtime server (rooms: `lobby`, `poker`)
3. Shared HTTP server + websocket transport (`@colyseus/ws-transport`)

## Realtime rooms
- `lobby` room: table listing/creation/join info (`src/lobby/LobbyRoom.ts`)
- `poker` room: table gameplay/auth/session lifecycle (`src/rooms/PokerRoom.ts`)

## Persistence
- Prisma + MySQL schema in `prisma/schema.prisma`.

## 3) Backend Layering Relevant to Live Play

## API + auth perimeter
- Auth routes: `src/engine/auth/AuthRouter.ts`
- Auth service/session lifecycle: `src/engine/auth/AuthService.ts`
- Protected economy routes: `src/http/EconomyRouter.ts`
- Lobby HTTP routes (table summaries/create): `src/http/LobbyRouter.ts`

## Realtime boundary
- Room-level auth in `PokerRoom.onAuth` (bearer token validation).
- `PokerRoom.onJoin` binds authenticated user to seat and delegates to dealer.
- `PokerRoom.onMessage("ACTION")` validates message and calls `Dealer.handleAction`.

## Game engine core
- Dealer orchestration: `src/engine/Dealer.ts`
- In-memory table state: `src/state/PokerState.ts`, `src/state/PlayerState.ts`
- Betting-round logic: `src/engine/rules/BettingRound.ts`
- Side-pot + split logic: `src/engine/rules/SidePotManager.ts`
- Deck/shuffle/draw: `src/engine/cards/DeckService.ts`

## Economy/accounting split
- Wallet entry/exit (`User.bankrollCents` <-> `PlayerBalance`): `src/engine/economy/CashierService.ts`
- In-hand debits/credits and balancing: `src/engine/persistence/LedgerService.ts`
- Dealer-facing persistence adapter: `src/engine/persistence/PersistenceFacade.ts`

## 4) Current Hand Lifecycle (As Implemented)

1. When >=2 seated players and street is `WAITING`, dealer starts hand.
2. New deck created and shuffled (crypto Fisher-Yates).
3. Hole cards dealt privately to active players.
4. SB/BB posted through persistence/ledger; pot updated.
5. `toActSeat` determined; betting round progresses via validated actions.
6. Streets advance: PREFLOP -> FLOP -> TURN -> RIVER.
7. Hand ends by:
- last standing player, or
- showdown with side-pot payout splitting.
8. Hand-balance assertion executes in persistence layer.
9. Next hand auto-schedules if >=2 players remain.

## Important implementation notes
- Turn enforcement is server-authoritative (`NOT_YOUR_TURN`).
- Actions are serialized through a dealer action queue (mutex-like behavior).
- Reconnect grace and abandoned-player handling are implemented.

## 5) Current Data Model (Live-Play-Critical)

## Core tables/models
- `User` (includes `bankrollCents`, currently default `0`)
- `PlayerBalance` (table-scoped balance)
- `BalanceTransaction` (audit trail)
- `PokerTable`, `PokerPlayer`
- `Hand`, `HandAction`, `HandPayout`
- `UserSession`

## Architecture intent already present
- Global bankroll should only move at buy-in/cash-out boundaries.
- In-hand money movement should stay inside table balance/ledger domain.

## 6) Realtime Contract and Message Flow (Current)

## Contract package
- `packages/realtime-contract/src/lobby.ts`
- `packages/realtime-contract/src/table.ts`

## Current table contract limitation
- Table outbound contract currently covers:
- `WELCOME`
- `SESSION_RESTORED`
- `ERROR`

## Current server emits beyond contract
- Dealer currently sends gameplay events like:
- `HOLE_CARDS`
- `ODDS_UPDATE`
- `HAND_START`
- `STREET_ADVANCE`
- `HAND_END`

This mismatch is a primary blocker for robust client gameplay rendering.

## 7) Client Architecture Relevant to Live Multiplayer

## Routing/screens
- `apps/client/app/lobby.tsx`
- `apps/client/app/table/[id].tsx`

## State/registry pattern
- Stores via Zustand and registry access (`apps/client/src/stores/*`, `apps/client/src/registry/store.registry.ts`)
- Realtime channel/message registries:
- `apps/client/src/registry/realtime-channel.registry.ts`
- `apps/client/src/registry/table-message.registry.ts`

## Transport layer
- `apps/client/src/realtime/useRealtimeChannel.ts`
- `apps/client/src/realtime/transport.ts`
- `apps/client/src/registry/transport.registry.ts`

Default transport path is Colyseus mode in current environment guidance.

## Table UI status today
- Table screen still uses mock data (`apps/client/src/lib/tableMocks.ts`) for opponents/cards/pot display.
- Action bar (`apps/client/src/components/domain/table/ActionBar.tsx`) is UI-first and not yet bound to authoritative server action options.

## 8) What Is Already Strong for the Roadmap

1. Server-side hand engine, turn gating, and pot logic are already implemented.
2. Session/auth/reconnect foundation is present in room and auth layers.
3. Economy architecture split (cashier vs ledger) is structurally correct.
4. Shared realtime contract package already exists, so extension path is straightforward.

## 9) Structural Gaps Directly Tied to the Roadmap

1. Table realtime contract does not yet represent full gameplay event surface.
2. Client table screen is not yet live-state-driven.
3. Client action options are not server-authoritative yet (min-raise/check/call visibility logic incomplete).
4. New-user bankroll starts at `0` instead of target `1_000_000`.

## 10) Baseline Summary

The codebase already has a production-shaped backend engine and data architecture for multiplayer poker. The main work for this iteration is **integration and contract completeness**: formalize realtime gameplay messages, bind client table UI to live state, expose legal action options per turn, and update new-user bankroll defaults.
