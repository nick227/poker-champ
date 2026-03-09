# poker-champ Voice Chat v0.1 (MVP bones)

This is a drop-in overlay that adds a WebRTC voice-chat proof-of-concept to poker-champ with a clean boundary:
- Client voice SDK + adapter (in `apps/client/src/voice/*`)
- Server relay (forwards messages only; no SDP storage)
- Shared signaling contract (in `src/voice/contracts/*`)

## What this version does
- Channel = tableId (or gameId) passed into `voice.joinChannel(channelId)`
- Users can:
  - toggle voice on/off (join/leave)
  - mute/unmute self
- Server protects resources:
  - feature-flagged (`VOICE_ENABLED=1`)
  - message validation + size guard
  - per-client rate limit (token bucket)
  - no broadcast; only targeted forwarding
- Future-ready hooks:
  - per-user mute
  - SFU / LiveKit swap
  - audio quality tuning

## What this version does NOT do (by design)
- No SFU (mesh P2P only)
- No per-user mute UI (stubs only)
- No fancy audio processing
- No persistent voice state in DB

---

## Install / integrate (high-level)
1) Copy folders into your repo (see Integration Guide):
- `apps/client/src/voice/**` (client SDK + adapter)
- `src/voice/contracts/**` (shared signaling contract)
- `src/rooms/voice/**` (server relay + guards)
- `docs/voice/**`

2) Server:
- Wire `registerVoiceRelay(pokerRoom)` in `PokerRoom.ts`
- Ensure your `client` has `userId` available on join messages

3) Client:
- Create `VoiceSDK` with `ColyseusVoiceAdapter(room)`
- Call `voice.joinChannel(tableId)` when user toggles voice ON
- Call `voice.leaveChannel()` when user toggles voice OFF

See: `docs/voice/01-integration-guide.md`.

---

## Environment flags
- `VOICE_ENABLED=1` enables server relay.
- `VOICE_STRICT=1` (optional) throws on invalid messages (dev/test). In prod it drops.

---

## File map
- **Server (this tree):** only `src/voice/contracts/*` — shared signaling schemas. No SDK/adapters/client here (those live in the client app).
- **Client:** `apps/client/src/voice/sdk/*`, `adapters/*`, `client/*` — SDK, Colyseus adapter, controller (Expo/Metro bundling).
- `src/rooms/voice/*` - server-side relay + guards
- `docs/voice/*` - docs and flow diagrams
