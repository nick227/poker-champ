# Channel semantics

For poker-champ, the recommended voice channel is:
- `channelId = tableId`

Reason:
- Stable across reconnects
- Human-readable in logs
- Doesn't change if Colyseus roomId changes

Server relay in v0.1 enforces:
- msg.channelId must equal `room.state.tableId` (if present)

If your state does not expose tableId on the room, change this line in:
- `src/rooms/voice/register-voice-relay.ts`

From:
- `const roomChannel = room.state.tableId ?? room.roomId;`

To your preferred channel key.
