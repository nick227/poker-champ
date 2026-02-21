# Voice Chat v0.1 Overview

## Goals
- Establish **bones** (modules, contracts, flows).
- Maximize **developer experience**: small surface area, declarative usage.
- Protect a free Railway server: minimal CPU/mem, no audio on server.

## Architecture
- Clients use WebRTC for audio transport (P2P mesh).
- Server provides **signaling relay** only (offer/answer/ICE).
- Server never stores SDP, never forwards to everyone, never allocates large buffers.

## Channel identity
- `channelId` is a string you pass from the app layer:
  - recommended: `tableId` (ex: `table_H6JBocbKQU`)
- All voice signaling messages include:
  - `channelId`
  - `fromUserId`
  - `toUserId` (targeted)
  - payload (`sdp` or `candidate`)

## Resource protection checklist
- Feature flag gating (`VOICE_ENABLED`)
- Rate limiting (token bucket)
- Message size limit
- Schema validation
- Drop if receiver not found / not in room
- Drop cross-channel messages

## UX states (client)
- Voice OFF (not joined)
- Voice ON (joined)
- Muted / unmuted
- Future: per-user mute, volume meters
