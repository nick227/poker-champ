# In-Game Chat — Implementation Proposal

## Current State

### UI (present, not wired)
- **Component**: `apps/client/src/components/domain/table/ChatOverlay.tsx`
  - Modal sheet with message list, text input, send button.
  - Local type: `Message = { id: string; sender: string; text: string; isSelf?: boolean }`.
  - Used on table screen with **stub props**: `messages={[]}` and `onSend={() => {}}`.
- **Copy**: `CHAT.placeholder`, `CHAT.empty` in `apps/client/src/constants/copy.ts`.
- Table screen toggles chat with icon button; no real data or send path.

### Schema (none for chat)
- **Prisma** (`prisma/schema.prisma`): No chat/message models. Tables have `PokerTable`, `PokerPlayer`, `Hand`, etc.; nothing for table chat.
- **Realtime contract** (`packages/realtime-contract/src/table.ts`):
  - **Inbound**: `ACTION`, `ADD_BOT`, `REMOVE_BOT` only. No `CHAT`.
  - **Outbound**: `WELCOME`, `SESSION_RESTORED`, `TABLE_SNAPSHOT`, `ERROR` only. No `CHAT_MESSAGE` (or equivalent).

### Backend
- **PokerRoom** (`src/rooms/PokerRoom.ts`): Handles `ADD_BOT`, `REMOVE_BOT`, `ACTION`, join/leave. No `CHAT` handler; no broadcast of chat messages.

### Client realtime
- **Table messages**: Sent via `storeRegistry.tables().dispatchTableAction()` → registered `tableSenders[tableId](type, payload)` (from `useTableRealtime`). Only ACTION (and ADD_BOT / REMOVE_BOT elsewhere) are sent.
- **Inbound**: `realtime-channel.registry.ts` table scope handles `WELCOME`, `SESSION_RESTORED`, `TABLE_SNAPSHOT`, `ERROR`, lifecycle. No handler for chat messages.

**Summary**: Chat is game-specific by placement (table screen) but has no schema, no backend path, and no wiring. Chats should be **table-scoped** (one logical chat per table/game).

---

## Goals

1. **Game-specific chat**: One chat per table; only players in that table room receive and can send messages for that table.
2. **Minimal schema**: Extend realtime contract and, optionally, persistence.
3. **Wire existing UI**: Connect `ChatOverlay` to real messages and send using the existing table realtime channel.

---

## Proposal

### 1. Realtime contract (schema)

**Inbound** — add to `TableInboundMessageSchema` in `packages/realtime-contract/src/table.ts`:

- `CHAT`: payload `{ text: string }`
  - Constraints: `text` length e.g. 1–500 chars (configurable), trim.

```ts
// Example addition
const ChatPayloadSchema = z.object({
  text: z.string().min(1).max(500).transform(s => s.trim()),
});
// In TableInboundMessageSchema array:
z.object({ type: z.literal("CHAT"), payload: ChatPayloadSchema }),
```

**Outbound** — add to `TableOutboundMessageSchema`:

- `CHAT_MESSAGE`: payload `{ id: string; tableId: string; senderUserId: string; senderName: string; text: string; createdAtTs: number }`
  - Include `tableId` even though implicit: helps debugging, client assertions, and matches other outbound diagnostics.

Export types and any new schemas from the contract package.

### 2. Backend (PokerRoom)

- **Handler**: `this.onMessage("CHAT", async (client, message) => { ... })`.
  - **Hard rules**: Client must belong to room; text trimmed; length 1–500. Parse with contract schema; on failure respond with `ERROR` (e.g. `BAD_MESSAGE`).
  - **Optional (recommended)**: Require seated player (not just spectator). Keeps chat “in-game”, not lobby-like.
  - **Broadcast**: On success, broadcast to **room** with type `CHAT_MESSAGE` and payload including `tableId` (see MVP shape below). Use existing `sendTableMessage`-style broadcast.
  - **Id**: Generate server-side (e.g. `cuid()` or uuid).
  - **Sender identity**: Resolve from session (userId / display name from join or seat). **Bots**: Disallow bot chat in v1 (tone, localization, moderation); canned bot phrases can be added later.
  - **Rate limiting**: Do nothing for MVP. If abuse appears later: server-side only, e.g. `lastChatAtByUserId[userId]`, ignore if `now - last < 750ms`.

No persistence in this phase (see §6).

### 3. Client — sending

- **Multitable store** (`apps/client/src/stores/multitable.store.ts`):
  - Add `dispatchSendChat(input: { tableId: string; text: string }): boolean` that:
    - Gets `tableSenders[tableId]`.
    - If missing, return `false`.
    - Call `send("CHAT", { text: input.text.trim() })` (after trim and length check if desired).
    - Return `true` if send called.
- **Contract guards**: Extend `isValidTableInbound` so `"CHAT"` with valid payload is accepted (contract package already extends `TableInboundMessageSchema`).

### 4. Client — receiving and state

- **State location**: Table store only — `tableStore.chatMessagesByTableId[tableId] = ChatMessage[]`. Not a global chat store.
  - **Why**: Chat lifetime matches table lifetime; clearing table clears chat automatically; prevents memory creep.
- **Message ordering**: No sequence numbers. Websocket ordering + append is enough. Optional: deduplicate by `id` if already exists.
- **Realtime registry** (`apps/client/src/registry/realtime-channel.registry.ts`): In `table` scope, add handler for `CHAT_MESSAGE`: append payload to `chatMessagesByTableId[tableId]` (optional cap, e.g. last 100).
- **Table screen** (`apps/client/app/table/[id].tsx`): Read messages for current `tableId`; map to `ChatOverlay`’s `Message` shape; pass `onSend` → `dispatchSendChat`. Keep `chatVisible` as today.
- **Optimistic echo**: No optimistic echo for MVP. Wait for server echo only; poker pace makes that fine. Keeps flow simple.

### 5. ChatOverlay

- Keep existing UI; only ensure props align with the new message shape (id, sender, text, isSelf). If we use `senderName` and `senderUserId`, the adapter from store → `Message` stays in the table screen or a thin hook.

### 6. Persistence — deferred for MVP

- Keeping chat **ephemeral** is correct for MVP: no compliance burden, no moderation tooling, no migration or retention policy. Later add `TableChatMessage` (Prisma) and load-on-join without changing the realtime contract. Good separation.

---

## MVP final shape (locked)

| Direction | Type | Payload |
|-----------|------|---------|
| **Inbound** | `CHAT` | `{ text: string }` (trimmed, 1–500) |
| **Outbound** | `CHAT_MESSAGE` | `{ id, tableId, senderUserId, senderName, text, createdAtTs }` |

**Client store**: `chatMessagesByTableId: Record<tableId, ChatMessage[]>` (in table store).

**UI**: `ChatOverlay` — `messages` = mapped from store for current `tableId`; `onSend` → `dispatchSendChat({ tableId, text })`.

---

## Why this fits the architecture

Same pipe as actions, same auth path, same room scoping. No new subsystems, no schema churn. Chat behaves like “table action, but not affecting game state”.

---

## Implementation Order

1. **Contract**: Add `CHAT` inbound and `CHAT_MESSAGE` outbound to `packages/realtime-contract`.
2. **Backend**: Add `CHAT` handler in PokerRoom; broadcast `CHAT_MESSAGE`; enforce auth/room (and optionally “seated only”).
3. **Client**: Add `dispatchSendChat` and `CHAT_MESSAGE` handler; add per-table chat state; wire table screen and `ChatOverlay` to real data and send.
4. **Optional**: Prisma model + load-on-join + persist-on-send; rate limit and moderation later.

---

## Files to Touch (summary)

| Area        | File(s) |
|------------|---------|
| Contract   | `packages/realtime-contract/src/table.ts` |
| Backend    | `src/rooms/PokerRoom.ts` |
| Client     | `apps/client/src/stores/table.store.ts` (chatMessagesByTableId), `apps/client/src/stores/multitable.store.ts` (dispatchSendChat), `apps/client/src/registry/realtime-channel.registry.ts`, `apps/client/app/table/[id].tsx` |
| Later      | `prisma/schema.prisma` (TableChatMessage), load-on-join, rate limit |

No schema exists today for in-game chat; this proposal adds it (realtime first, DB optional) and wires the existing UI to game-specific (table-scoped) chat. Once wired: real in-game chat, zero persistence cost, clean upgrade path later.
