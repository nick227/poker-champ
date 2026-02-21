# Exact signaling flow diagram (v0.1)

## Actors
- **A** = caller / initiator
- **B** = callee / responder
- **Server** = signaling relay (Colyseus PokerRoom)

## Preconditions
- Both clients are in the same PokerRoom (same table/game).
- Both have voice toggled ON (joined channel).
- Each client has a list of peer userIds (from snapshot).

---

## Diagram (Offer/Answer + ICE)

```mermaid
sequenceDiagram
  autonumber
  participant A as Client A (VoiceSDK)
  participant S as Server (VoiceRelay)
  participant B as Client B (VoiceSDK)

  Note over A,B: Both call joinChannel(channelId)

  A->>A: create RTCPeerConnection(B)
  A->>A: addTrack(localMicTrack)
  A->>A: createOffer()
  A->>A: setLocalDescription(offer)

  A->>S: VOICE_SIGNAL {type: OFFER, to:B}
  S->>B: VOICE_SIGNAL {type: OFFER, from:A}

  B->>B: create RTCPeerConnection(A)
  B->>B: addTrack(localMicTrack)
  B->>B: setRemoteDescription(offer)
  B->>B: createAnswer()
  B->>B: setLocalDescription(answer)

  B->>S: VOICE_SIGNAL {type: ANSWER, to:A}
  S->>A: VOICE_SIGNAL {type: ANSWER, from:B}

  Note over A,B: ICE candidates trickle both ways

  A->>S: VOICE_SIGNAL {type: ICE, to:B, candidate}
  S->>B: VOICE_SIGNAL {type: ICE, from:A, candidate}

  B->>S: VOICE_SIGNAL {type: ICE, to:A, candidate}
  S->>A: VOICE_SIGNAL {type: ICE, from:B, candidate}

  Note over A,B: Once connected, audio flows P2P (server not involved)
```

---

## Determinism notes
- To avoid offer-collisions, we use a stable initiator rule:
  - `initiator = (selfUserId < peerUserId)` lexicographically
  - initiator creates offer; responder waits for offer.
