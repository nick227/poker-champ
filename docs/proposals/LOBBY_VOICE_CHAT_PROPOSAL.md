# Lobby Voice Chat Proposal

## Summary

Add voice chat for users in the **lobby** only, reusing the existing voice stack (VoiceSDK, signaling, WebRTC mesh) and the same join/mute UI used on the table. Connections must be closed reliably when users leave the lobby.

## Current State

- **Table voice**: Per-table room; voice uses `VoiceSDK` + `createVoiceController` + `ColyseusVoiceAdapter(room)`; peers from table snapshot (seats); UI in `TableTopBarActions` (Join/Stop Voice, mute, indicator).
- **Lobby**: `useLobbyRealtime()` with scope `"lobby"`; Colyseus uses room name `"lobby"`; no voice today.
- **Paths**: `apps/client/src/voice/sdk/VoiceSDK.ts`, `create-voice-controller.ts`, `ColyseusVoiceAdapter`, `TableTopBarActions`, `useVoiceControllerLifecycle`, `useVoiceJoinPolicy`.

## Goals

1. **Lobby-only voice** – Only users currently on the lobby screen participate; no cross-talk with table rooms.
2. **Reuse UI** – Same controls as table: Join/Stop Voice, mute toggle, speaking indicator (as in `TableTopBarActions`).
3. **Reuse SDK** – Same `VoiceSDK`, `createVoiceController`, and adapter pattern; no duplicate voice logic.
4. **Strict lifecycle** – Leave channel and tear down connections on every exit path (unmount, app background, realtime disconnect, auth logout, route replace, hard nav to table).

---

## 1. Channel Isolation (Most Important)

**Correctness boundary:** Table `channelId` must never equal Lobby `channelId`. Cross-channel signaling must be rejected.

- **Lobby:** `channelId = "lobby"` (strict constant). Client must never send table IDs as `channelId` when in the lobby room, and must never send `"lobby"` when in a table room.
- **Server relay (lobby room):**
  - When `roomName === "lobby"`: **reject** any `VOICE_SIGNAL` where `payload.channelId !== "lobby"`.
  - Do not relay table signaling into the lobby room.
- **Server relay (table room):**
  - When room is a poker/table room: **reject** any `VOICE_SIGNAL` where `payload.channelId === "lobby"`.
  - Do not relay lobby signaling into table rooms.

**Rule:** Someone in a table must not be able to signal into the lobby, and vice versa. Enforce this in the server relay so a bug or malicious client cannot reuse the same channel or inject cross-channel traffic.

---

## 2. Proposal

### 2.1 Reuse voice UI

- Extract a small **shared voice control** component (Join/Stop, mute, indicator) or use `TableTopBarActions` in a lobby-only mode. Lobby uses it in the **masthead or ProfileStrip** right action (e.g. next to “X Online”).
- **Do not** bury voice controls inside table-only UI. Lobby should visually feel separate.
- **UX:** Add a small label **“Lobby Voice (N)”** where N = number of participants. Helps users see “is anyone there? is it worth joining?”

### 2.2 Lobby signaling and adapter

- Lobby joins a room (`roomName: "lobby"`). Expose a **room-like** handle from the lobby realtime path and pass it to `ColyseusVoiceAdapter`. Use **`channelId = "lobby"`** only.
- Same contract as table; different channel id constant.

### 2.3 Peer list — server-driven only

**Do not use “everyone in lobby” as peers.** Connecting to everyone in lobby would:

- Attempt peer connections to people not in voice
- Generate unnecessary ICE traffic and increase CPU/bandwidth
- Be messy and hard to reason about

**Use a server-driven voice participant list:**

- **Server** maintains `lobbyVoiceParticipants: Set<userId>`.
  - When a client **joins** lobby voice (e.g. app sends `JOIN_LOBBY_VOICE`) → add userId.
  - When a client **leaves** lobby voice (`LEAVE_LOBBY_VOICE`) or **disconnects** → remove userId.
- **Server** broadcasts `LOBBY_VOICE_PARTICIPANTS: userIds[]` to all clients in the lobby room.
- **Client** calls `controller.setPeers(userIds)` when it receives that message.

This keeps the mesh minimal and correct: only users who have actually joined lobby voice are peers.

### 2.4 Single lifecycle hook — no duplication

**Do not** add a separate `useLobbyVoiceControllerLifecycle`. Refactor to one hook used by both table and lobby:

```ts
useVoiceChannelLifecycle({
  room,
  channelId,
  peerSource,
})
```

- **Table:** `channelId = tableId`, `peerSource = seats` (from snapshot; derive peer userIds as today).
- **Lobby:** `channelId = "lobby"`, `peerSource = lobbyVoiceParticipants` (from server `LOBBY_VOICE_PARTICIPANTS`).

Same hook, different config. Cleaner and avoids future drift.

### 2.5 Lifecycle and cleanup (critical)

**Leave and tear down on all of:**

- React component unmount
- App background (AppState change)
- Realtime disconnect
- Auth logout
- Route replace / hard navigation to table

**Do not rely purely on component unmount.** Use a lifecycle hook that:

- Subscribes to **AppState** (e.g. `background` → call leave).
- Subscribes to **realtime connection state** (e.g. disconnected → call leave).
- Still runs cleanup on unmount.

If any of these miss cleanup: zombie RTCPeerConnections, mic still active, users ghost-connected.

**Cleanup correctness checklist** — after leave, all of the following must hold:

- `voiceControllerRef.current === null`
- All RTCPeerConnections closed (`peerConnections.length === 0`)
- `localStream === null`
- Mic track stopped

Ensure `VoiceSDK.leaveChannel()` / controller `leave()` actually: closes all RTCPeerConnections, stops local tracks, clears peer list, removes listeners. **If not, fix VoiceSDK first** before relying on it for lobby.

### 2.6 Lobby screen wiring (`lobby.tsx`)

- Pass lobby room into `useVoiceChannelLifecycle` with `channelId = "lobby"` and `peerSource` from `LOBBY_VOICE_PARTICIPANTS`.
- State: `voiceEnabled`, `voiceMuted`; render shared voice controls in masthead or ProfileStrip; show “Lobby Voice (N)” when N is known.

### 2.7 Server

- **Channel validation:** In relay logic, if `roomName === "lobby"` then require `payload.channelId === "lobby"`; otherwise reject. For table rooms, reject `payload.channelId === "lobby"`. No cross-channel injection.
- **Lobby voice relay:** Relay `VOICE_SIGNAL` in lobby room (targeted by `toUserId`), only when channel validation passes.
- **Participant list:** Maintain `lobbyVoiceParticipants`, broadcast `LOBBY_VOICE_PARTICIPANTS` on join/leave/disconnect.
- **Size / rate limiting:** Keep payload size clamp; rate-limit ICE candidate spam. Lobby voice can increase signaling volume — apply same or stricter limits.

---

## 3. Performance and scaling

Mesh voice scales **O(N²)**. Lobby is riskier than table:

- **Table:** typically 2–6 players.
- **Lobby:** potentially 10–20 users. At 10 users → 45 peer connections.

**Preemptively:**

- **Soft cap** lobby voice at **6–8** users (e.g. “Lobby voice full” or reject new joins when at cap), **or**
- Auto-connect only to the first N participants and show “Lobby voice full” for the rest.

No SFU required yet, but be aware of the limit.

---

## 4. Future improvements to the WebRTC / voice system

Out of scope for this feature; align with a single voice stack for table and lobby.

1. **TURN / connectivity** – Fallback for NAT/firewall; reconnection after network blips.
2. **Reconnection** – Rejoin/backoff when signaling drops.
3. **Bandwidth / quality** – Adaptive bitrate; low-bandwidth mode.
4. **Echo cancellation / AGC** – Browser/device APIs.
5. **Speaking indicator** – Optional server-mediated events.
6. **Larger rooms** – SFU or selective mesh if lobby grows beyond soft cap.
7. **Unified room-like abstraction** – Single adapter interface for table, lobby, and future channels.

---

## 5. Tasks

- [ ] **VoiceSDK:** Verify `leaveChannel()` closes all RTCPeerConnections, stops local tracks, clears peer list, removes listeners; fix if not.
- [ ] Refactor to **`useVoiceChannelLifecycle({ room, channelId, peerSource })`**; table uses `tableId` + seats, lobby uses `"lobby"` + server participant list.
- [ ] Lifecycle hook subscribes to **AppState** and **realtime connection** so leave runs on background and disconnect, not only unmount.
- [ ] Expose lobby room (or `RoomLike`) from lobby realtime; wire lobby screen to `useVoiceChannelLifecycle` with `channelId = "lobby"`.
- [ ] Add shared voice controls + “Lobby Voice (N)” in masthead or ProfileStrip.
- [ ] **Server:** Channel validation (lobby room ↔ `channelId === "lobby"` only; table rooms reject `"lobby"`). Relay `VOICE_SIGNAL` in lobby; maintain and broadcast `LOBBY_VOICE_PARTICIPANTS`. Payload clamp and ICE rate limiting.
- [ ] **Server:** Soft cap lobby voice at 6–8 users (or first N).
- [ ] Verify cleanup on: unmount, app background, realtime disconnect, navigate to table.

---

## 6. Summary scorecard

| Category              | Verdict                                  |
|-----------------------|------------------------------------------|
| Channel separation    | Enforced; server rejects cross-channel   |
| SDK reuse             | Same VoiceSDK + controller               |
| UI reuse              | Shared controls; lobby in masthead/ProfileStrip |
| Peer strategy         | Server-driven list only                  |
| Lifecycle             | Unmount + AppState + realtime            |
| Scaling awareness     | Soft cap 6–8; mesh O(N²)                 |

---

## References

- Table voice UI: `apps/client/src/components/domain/table/TableTopBarActions.tsx`
- Table voice lifecycle: `apps/client/src/components/domain/table/hooks/useVoiceControllerLifecycle.ts`
- Voice SDK: `apps/client/src/voice/sdk/VoiceSDK.ts`
- Controller factory: `apps/client/src/voice/client/create-voice-controller.ts`
- Lobby screen: `apps/client/app/lobby.tsx`
- Lobby realtime: `apps/client/src/realtime/useLobbyRealtime.ts`
- Voice overview: `docs/voice/00-overview.md`, `docs/voice/01-integration-guide.md`
