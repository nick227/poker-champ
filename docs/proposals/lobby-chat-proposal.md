# Lobby Chat Proposal

## Goal
Add lobby chat with identical UI to table chat, but built for long-lived history with strict pagination and bounded client memory.

## Why This Change
- Table chat today is realtime-only and capped in-memory (`CHAT_MESSAGES_CAP = 100`), which is fine for short table sessions.
- Lobby chat is effectively continuous and cannot rely on unbounded in-memory growth or full-history fetches.
- We should standardize chat UI once, then reuse at both table and lobby scopes.

## Scope
- Reuse one chat overlay UI/behavior for both table and lobby.
- Add paginated lobby chat history API.
- Add lobby realtime chat send/receive events.
- Keep table chat behavior functionally the same in phase 1 (UI refactor only), then optionally migrate table to paginated history in a follow-up.

## Phase Plan

### 1. Modularize chat UI first (required first step)
Create a reusable chat module and wire both table + lobby to it.

Proposed files:
- `apps/client/src/components/domain/chat/ChatOverlay.tsx`
- `apps/client/src/components/domain/chat/useChatOverlay.ts`
- `apps/client/src/components/domain/chat/types.ts`

Implementation notes:
- Move current `apps/client/src/components/domain/table/ChatOverlay.tsx` and `apps/client/src/components/domain/table/hooks/useChatOverlay.ts` into `domain/chat`.
- Keep the visual presentation exactly unchanged (same modal shell, message bubbles, input row, badges).
- Keep table wiring unchanged except import-path updates:
  - `apps/client/app/table/useTableScreenController.tsx`
  - `apps/client/app/table/TableScreenOverlays.tsx`
- Add lobby wiring in `apps/client/app/lobby.tsx` to open the same overlay from the profile strip chat icon.

Shared hook contract:
- `useChatOverlay({ messages, onSend, onLoadOlder?, hasMore?, loadingOlder?, maxMessages? })`
- Table mode passes only `messages` + `onSend`.
- Lobby mode passes pagination callbacks/flags.

Acceptance for phase 1:
- Table chat looks and behaves exactly the same.
- Lobby can open the same overlay component.
- No table gameplay/realtime regressions.

### 2. Add lobby chat data model (schema)
Add durable storage for lobby chat messages with scope support now.

Prisma changes (`prisma/schema.prisma`):
- New model `LobbyChatMessage`:
  - `id String @id`
  - `scope String @default("lobby")`
  - `createdAt DateTime @default(now())`
  - `senderUserId String`
  - `senderName String`
  - `text String` (enforce max length in service/contract)
- Indexes:
  - `@@index([scope, createdAt, id])` for keyset pagination
  - `@@index([scope, senderUserId, createdAt])`

Migration:
- Add migration under `prisma/migrations/*_add_lobby_chat_message/`.

### 3. Add paginated lobby chat HTTP routes
Extend `src/http/LobbyRouter.ts` and OpenAPI definitions (`src/http/openapi.ts`).

New endpoint:
1. `GET /api/lobby/chat/messages?scope=&cursor=&limit=`
- Auth required.
- `scope` defaults to `lobby` in v1.
- `limit` hard bounded (`1..100`, default `50`).
- Returns newest-first page and `nextCursor`.
- Cursor format: `${createdAtMs}:${id}`.
- Response shape:
  - `messages: LobbyChatMessageDto[]`
  - `nextCursor: string | null`

Pagination contract rules (strict):
- No offset pagination.
- Reject out-of-range `limit`.
- Strict cursor decode validation:
  - exactly 2 parts split by `:`
  - `createdAtMs` is an integer
  - `id` is non-empty
- Deterministic order: `ORDER BY createdAt DESC, id DESC`.
- Cursor filter:
  - `createdAt < cursorTs`
  - OR `createdAt = cursorTs AND id < cursorId`.

Write path policy:
- Skip `POST /api/lobby/chat/messages` in v1.
- Realtime is the only send path.
- HTTP is history fetch only.

### 4. Add lobby chat realtime contract + room handling
Update `packages/realtime-contract/src/realtime.ts` and `src/lobby/LobbyRoom.ts`.

Inbound message additions:
- `SEND_LOBBY_CHAT` payload `{ text: string }`.

Outbound message additions:
- `LOBBY_CHAT_MESSAGE` payload:
  - `id`
  - `senderUserId`
  - `senderName`
  - `text`
  - `createdAtTs` (server-created timestamp only)

`LobbyRoom` handling:
- Validate payload with contract schema.
- Require authenticated user.
- Normalize text with `trim()` and enforce `1..500`.
- Add cheap room-level rate limiting:
  - per-user min interval: 1 message per 800ms
  - burst cap: 5 messages per 10s
  - reject with `ERROR { code: "RATE_LIMITED" }`
- Persist message, then broadcast `LOBBY_CHAT_MESSAGE`.

### 5. Client store/realtime integration for lobby chat
Update:
- `apps/client/src/stores/lobby.store.ts`
- `apps/client/src/realtime/useLobbyRealtime.ts`
- `apps/client/src/registry/realtime-channel.registry.ts`

Add lobby chat state:
- `chatMessages: LobbyChatMessage[]`
- `chatNextCursor: string | null`
- `chatHasMore: boolean`
- `chatLoading: boolean`
- `chatLoadingMore: boolean`
- `chatError: string | null`

Store invariants (enforce in one place):
- Messages are unique by `id`.
- Messages are always sorted DESC by `(createdAtTs, id)`.
- Older-page loads append at the end (older side).

Actions:
- `loadInitialLobbyChat()`
- `loadOlderLobbyChat()`
- `appendLobbyChatRealtime(message)`
- `sendLobbyChat(text)`

Merge behavior:
- Dedupe only by `id`.
- Realtime during pagination needs no special branch if dedupe + sort invariants hold.
- Never dedupe by `(timestamp,text)` or text heuristics.

### 6. Bounded memory policy (deterministic)
Use a fixed cap for lobby chat cache.

Policy:
- `LOBBY_CHAT_MAX = 400`
- On realtime append, if `len > MAX`, trim oldest entries from the bottom.
- On older-page load, allow merge up to `MAX`; trim overflow from oldest end and force `chatHasMore = true` when trimmed.

This keeps memory bounded and preserves latest-message UX.

## Route + Contract Change Summary
- `GET /api/lobby/chat/messages` (new)
- `LobbyInboundMessageSchema`: add `SEND_LOBBY_CHAT`
- `LobbyOutboundMessageSchema`: add `LOBBY_CHAT_MESSAGE`
- `LobbyRouter` and `openapi.ts`: add paginated chat endpoint docs/validation
- `LobbyRoom`: add send->persist->broadcast flow with rate limiting

## Testing Plan
Server:
- `LobbyRouter` tests for:
  - auth required
  - cursor decode/encode validation (`createdAtMs:id`)
  - limit bounds
  - stable ordering and `nextCursor`
  - same timestamp, different ids pagination boundary
  - no duplicates across page boundaries
- `LobbyRoom` tests for:
  - valid send -> persisted + broadcast
  - invalid payload rejected
  - unauthenticated send rejected
  - rate-limited send rejected

Client:
- merge test: load page 1, receive realtime, load older page 2 -> no dupes, still sorted
- cap test: append beyond `LOBBY_CHAT_MAX` trims oldest
- pagination state transition tests (`loading`, `loadingMore`, `hasMore`)
- regression check that table chat still works after modularization

## Rollout Strategy
1. Land phase 1 (UI modularization only) with no behavior change.
2. Land backend schema + paginated route + realtime lobby events.
3. Land lobby client integration and enable lobby chat icon/overlay.
4. Optional follow-up: migrate table chat history to same scoped/paginated model.

## Risks
- Message ordering bugs when merging paginated history with realtime stream.
- Duplicate messages without strict id-based dedupe.
- Cursor bugs causing skips/duplicates across page boundaries.

Mitigations:
- Keyset pagination only.
- Composite order (`createdAt`, `id`) everywhere.
- Dedupe by `id` at store boundary.
- Server-authoritative timestamps for ordering.

## Open Decision
Decide whether lobby chat scope is:
- global single scope (`lobby`) only
- future multi-scope (`lobby`, `region`, `club`, etc.)

Proposal assumes multi-scope-ready schema now, with `scope="lobby"` in v1.

## Definition of Done
- Same chat overlay component is used by table and lobby.
- Lobby chat history is strictly paginated via cursor.
- Realtime lobby chat send/receive works.
- Table chat behavior remains unchanged.
