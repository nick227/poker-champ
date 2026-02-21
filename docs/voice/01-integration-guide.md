# Integration Guide (poker-champ)

This overlay assumes:
- You already have Colyseus `PokerRoom`
- Each connected client is associated with a `userId`
- Your client can call `room.send(type, payload)`

## 1) Server integration

### A) Add relay registration
In `src/rooms/PokerRoom.ts` (or wherever you define the room):
- Import and call `registerVoiceRelay(this)` in `onCreate()`.

```ts
import { registerVoiceRelay } from "./voice/register-voice-relay.js";

onCreate(options) {
  // existing setup...
  registerVoiceRelay(this);
}
```

### B) Ensure you can map `client -> userId`
The relay needs to route a message to a specific recipient client.

This overlay provides a helper `getClientUserId(client)` in:
- `src/rooms/voice/voice-client-identity.ts`

Update that function to match how you store auth:
- `client.auth.userId`
- `client.userData.userId`
- metadata map
- etc.

## 2) Client integration

### A) Create adapter + SDK
When you have a `room` instance:

```ts
import { VoiceSDK } from "../voice/sdk/VoiceSDK";
import { ColyseusVoiceAdapter } from "../voice/adapters/ColyseusVoiceAdapter";

const adapter = new ColyseusVoiceAdapter(room);
const voice = new VoiceSDK({ adapter, selfUserId, channelId: tableId });
```

### B) Toggle on/off + mute
```ts
await voice.joinChannel(); // starts mic + signaling
voice.setMuted(true);      // locally mutes
await voice.leaveChannel(); // cleanup
```

### C) Peer list
v0.1 requires the app to provide peers.
Use the table snapshot to collect connected humans and call:

```ts
voice.setPeers(peerUserIds);
```

Future versions can have server broadcast a peer list event.

## 3) Contracts
- Messages are defined in `src/voice/contracts/voice-signals.ts`.
- Server validates payload with zod in `src/rooms/voice/voice-signal-schema.ts`.

## 4) Known limitations
- P2P mesh gets expensive beyond ~6-8 peers.
- In poker, tables are small → acceptable for MVP.
