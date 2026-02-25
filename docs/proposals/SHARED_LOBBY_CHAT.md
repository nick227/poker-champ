# Shared Lobby Chat MVP (Low Churn)

## Goal
Create one shared lobby chat across `lobby`, `history`, `leaderboard`, `slots`, and `settings` with:
- strict keyset pagination
- bounded client memory
- realtime send/receive
- no lobby socket churn between tabs
- no backend protocol redesign

## Architecture Decisions

### 1) Lobby Realtime Is App Infrastructure
- Mount `LobbyRealtimeBridge` once at app root (`app/_layout.tsx` or `AppShell`).
- Remove per-screen `useLobbyRealtime` ownership.
- Screens consume shared lobby state/actions only.
- Result: one stable lobby session while navigating tabs.

### 2) One Lobby Chat Scope
- Introduce constant: `LOBBY_CHAT_SCOPE = "lobby:global"`.
- Use it for:
  - history fetch scope
  - unread tracking scope key
  - overlay identity
  - store identity
- Prevents per-screen drift (`lobby:lobby`, `lobby:history`, etc).

### 3) Shared Chat UI Module
- Keep using shared chat UI under `domain/chat/`:
  - `ChatOverlay.tsx`
  - `useChatOverlay.ts`
  - `types.ts`
- Table chat usage remains unchanged.
- Lobby chat uses same UI with pagination/realtime props.

## Backend Design

### Prisma
`LobbyChatMessage` with index:
- `@@index([scope, createdAt, id])`

### HTTP History Route
`GET /api/lobby/chat/messages?cursor=&limit=`

Rules:
- keyset pagination only
- cursor format: `${createdAtMs}:${id}`
- order: `createdAt DESC, id DESC`
- hard limit cap: `<= 100`

### Realtime
Inbound:
- `SEND_LOBBY_CHAT`

Outbound:
- `LOBBY_CHAT_MESSAGE`

Flow:
- validate
- rate limit
- persist
- broadcast

No dual-write path.

## Client Store Rules

State:
- `chatMessages[]`
- `chatNextCursor`
- `chatHasMore`
- `chatLoading`
- `chatLoadingMore`

Invariants:
- dedupe by `id`
- stable DESC sort by `(createdAtTs, id)`
- bounded memory cap = `400`
- trim oldest overflow

Realtime append behavior:
- append
- dedupe
- preserve sort invariants

## Voice Presence Integration (MVP)
- Use existing `lobbyVoiceParticipantIds`.
- In `OnlinePlayersSheet`, render:
  - green filled dot when `player.userId` is in voice set
  - neutral/outlined dot otherwise
- No backend or voice transport changes for MVP.

## Per-Player Mute Boundary
Per-peer mute is deferred (not MVP). Current voice stack does not fully expose remote-track controls for safe low-risk mute UX.

Phase 2:
- emit remote-track events keyed by `peerUserId`
- maintain local `mutedPeerIds`
- apply mute at remote audio output layer
- add mute/unmute control in `OnlinePlayersSheet`

## Rollout Order
1. Add singleton `LobbyRealtimeBridge`.
2. Remove per-screen realtime ownership gradually (start with `lobby`).
3. Standardize `LOBBY_CHAT_SCOPE`.
4. Wire lobby chat pagination + realtime through shared state.
5. Add voice presence dot to online sheet.
6. Typecheck and smoke-test tab switching/connection stability.

## Acceptance Criteria
- Tab switching does not reconnect lobby realtime.
- Lobby chat is identical across all lobby-adjacent screens.
- Chat history is paginated; no full-history fetches.
- Realtime messages appear immediately across screens.
- Client chat memory remains bounded.
- Online players sheet correctly reflects lobby voice participation.
- No backend contract redesign required.

## Risks / Caveats
- Root-mounted bridge must handle auth-hydration timing cleanly.
- Shared voice/chat controls in `ProfileStrip` must read unified state to avoid UI drift.
- Per-peer mute intentionally deferred until remote-track plumbing exists.
