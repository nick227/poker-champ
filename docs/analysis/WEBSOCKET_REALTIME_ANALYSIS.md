# WebSocket / Realtime Analysis (Current State + Proposal)

## Scope
This document audits realtime networking across:
- Server (`src/index.ts`, `src/lobby/LobbyRoom.ts`, `src/rooms/PokerRoom.ts`, `src/http/LobbyRouter.ts`)
- Client (`apps/client/src/realtime/*`, `apps/client/src/registry/*`, store/screen usage)

It captures what is implemented now, what is risky or inconsistent, and a practical proposal.

## Executive Summary
- The backend runs **Express + Colyseus on one HTTP server** (`src/index.ts`) using `WebSocketTransport`.
- Client supports two modes (`ws`, `colyseus`) via `apps/client/src/realtime/transport.ts` and `apps/client/src/registry/transport.registry.ts`.
- Current architecture improvements are strong (central registries, unified channel dispatch, store-driven action dispatch).
- There are **critical protocol mismatches** in table flow that likely break gameplay in practice unless custom infra exists outside this repo.

High-risk findings:
1. `ws` mode appears incompatible with server implementation in this repo (no raw `/ws` handler found).
2. Table join contract mismatch: server requires `buyInCents` during room join, client does not provide it.
3. Action payload mismatch: client sends lowercase action + extra `type` field, server expects uppercase enum and no extra field.
4. Realtime is not contract-first yet (not in OpenAPI/SDK flow), so drift risk is high.

## Current Server Design

### Transport/runtime
- `src/index.ts`
  - Creates Express app + HTTP server.
  - Mounts Colyseus with `new WebSocketTransport({ server })`.
  - Defines rooms:
    - `lobby` -> `LobbyRoom`
    - `poker` -> `PokerRoom`

### Lobby room behavior
- `src/lobby/LobbyRoom.ts`
  - Handles:
    - `LIST_TABLES` -> sends `TABLE_LIST`
    - `CREATE_TABLE` -> validates, creates poker room, sends `TABLE_CREATED`, broadcasts `TABLE_LIST`
    - `JOIN_TABLE` -> validates password/private logic, sends `TABLE_JOIN_INFO` with `{ tableId, roomId }`

### Poker room behavior
- `src/rooms/PokerRoom.ts`
  - Auth in `onAuth` via bearer/session token.
  - Join in `onJoin` requires `buyInCents > 0` and binds user/client.
  - Handles in-room `ACTION` with schema validation (`src/messages/schemas.ts`).
  - Supports disconnection/reconnection (`allowReconnection`, `SESSION_RESTORED`).

### HTTP fallback/parallel path
- `src/http/LobbyRouter.ts`
  - `GET /api/lobby/tables` returns table summaries from Colyseus room metadata.
  - `POST /api/lobby/tables` creates table via `matchMaker`.

## Current Client Design

### Realtime layers
- `apps/client/src/realtime/transport.ts`
  - Implements two client transports:
    - Raw browser `WebSocket` (`ws` mode)
    - `colyseus.js` (`colyseus` mode)
  - Normalizes lifecycle events: `CONNECTED`, `DISCONNECTED`, `RECONNECTING`.

- `apps/client/src/realtime/useRealtimeChannel.ts`
  - Generic realtime hook with `{ scope: "lobby" | "table", id? }`.
  - Delegates config resolution to `apps/client/src/registry/transport.registry.ts`.

- Wrappers:
  - `apps/client/src/realtime/useLobbyRealtime.ts`
  - `apps/client/src/realtime/useTableRealtime.ts`

### Registry-driven dispatch
- Unified message registry by scope:
  - `apps/client/src/registry/realtime-channel.registry.ts`
- Compatibility wrappers:
  - `realtime-message.registry.ts` (lobby)
  - `table-message.registry.ts` (table)

### Store wiring
- `apps/client/src/stores/multitable.store.ts`
  - Registers table sender functions.
  - `dispatchTableAction(...)` sends `ACTION` through store-owned sender.
- UI no longer sends realtime directly in table screen.

## Contract/Protocol Mismatches (Important)

### 1) Raw `ws` mode likely does not match server protocol
- Client default env currently suggests raw ws endpoint:
  - `apps/client/.env.example`: `EXPO_PUBLIC_WS_URL=ws://localhost:3000/ws`, `EXPO_PUBLIC_REALTIME_TRANSPORT=ws`
- Server in repo exposes Colyseus over its HTTP server (`src/index.ts`), but no explicit raw `/ws` route/upgrade handler was found.
- Unless external proxy/bridge exists outside this repository, `ws` mode is likely a dead path.

### 2) Table join options mismatch
- Server (`PokerRoom.onJoin`) requires positive `buyInCents`.
- Client table channel currently joins by room id with token only (no `buyInCents`).
- Expected outcome: join rejection with `INVALID_ACTION`/leave behavior.

### 3) ACTION payload mismatch
- Client sends payload like `{ type: "ACTION", action: "raise", tableId, amountCents }`.
- Server action schema expects `{ action: "RAISE", amountCents }` (uppercase enum, no `type`, no `tableId`).
- Expected outcome: schema validation failure (`BAD_MESSAGE`) for most actions.

### 4) Duplicate/competing lobby paths
- Lobby data comes from both:
  - HTTP `GET /api/lobby/tables`
  - Realtime `LIST_TABLES`/`TABLE_LIST`
- This is workable, but reconciliation policy is implicit.

### 5) Realtime contract not in contract-first pipeline
- OpenAPI/SDK pipeline covers HTTP only.
- Realtime message schemas/types are not generated from a single contract artifact.
- Drift risk remains high between server and client event shapes.

## What Is Good Today
- Reconnect lifecycle events normalized and dispatched consistently.
- Registry architecture reduces branchy code and extension friction.
- Store-centric dispatch for table actions is a solid foundation for replay/offline patterns.
- Server has robust room-level auth and reconnection handling in `PokerRoom`.

## Proposal (Phased)

## Phase 0: Stabilize transport mode (Immediate)
1. Make `colyseus` the default client transport in `apps/client/.env.example`.
2. Treat `ws` mode as experimental/off until a real server-side raw ws protocol exists.
3. Update docs (`apps/client/DEVELOPER.md`) to reflect real default and compatibility.

Acceptance:
- Local setup works with only Colyseus URL configured.
- No hidden dependency on `/ws` endpoint.

## Phase 1: Fix table protocol compatibility (Immediate)
1. Define canonical table join input:
- Include `buyInCents` in join options from client when joining poker room.
2. Normalize action payload shape in one mapper:
- `fold` -> `FOLD`, `raise` -> `RAISE`, etc.
- Send only `{ action, amountCents }` inside `ACTION` payload.
3. Remove/replace redundant `JOIN_TABLE` message sent after table connection:
- If keeping it, server must handle it in `PokerRoom`.
- Preferred: rely on `onJoin` contract and remove message.

Acceptance:
- Joining table succeeds with authenticated user + valid buy-in.
- First action passes schema and is processed by dealer.

## Phase 2: Make realtime contract-first (High ROI)
Choose one:
1. **AsyncAPI** spec for realtime channels/messages, generated client/server types.
2. Shared Zod contract package (e.g., `packages/realtime-contract`) with codegen wrappers.

Minimum contract should include:
- Channel scope: `lobby`, `table`
- Inbound/outbound message names
- Payload schemas
- Auth requirements
- Version field

Acceptance:
- Client and server compile against shared message types.
- CI drift check for realtime contract artifacts.

## Phase 3: Observability + resilience
1. Add structured logs/metrics for:
- connect, auth failure, join failure reason, action validation errors, reconnect count.
2. Add client-visible status model (`transportState`, `tableStatus`, `lastErrorCode`).
3. Add backoff policy config in transport registry.

Acceptance:
- Failures are diagnosable without ad hoc console debugging.

## Suggested Test Plan

### Integration tests (must-have)
- Lobby:
  - Connect + `LIST_TABLES` -> receives `TABLE_LIST`.
- Table:
  - Join by room id with token + buy-in succeeds.
  - `ACTION` payload with mapped enum accepted.
  - Invalid payload rejected with deterministic code.
- Reconnect:
  - Disconnect and reconnect within grace -> `SESSION_RESTORED`.

### CI gates
- Keep `pnpm verify` as canonical gate.
- Add realtime smoke test command (e.g., `pnpm test:realtime`) for protocol path.

## Recommended Next Changes (Concrete)
1. Update `apps/client/.env.example` defaults to Colyseus-first.
2. Add action mapper (`table-action.registry.ts` or dedicated `realtime.mapper.ts`) for enum casing.
3. Add `buyInCents` flow to table connect path.
4. Remove `JOIN_TABLE` send from `useTableRealtime` unless server handler is added.
5. Introduce shared realtime contract package/spec and CI drift check.

## Risk if Unchanged
- Table join/action failures may appear as reconnect loops or generic realtime errors.
- Environment-dependent behavior (`ws` vs `colyseus`) may mask production bugs.
- Feature velocity will degrade as message shape drift accumulates.
