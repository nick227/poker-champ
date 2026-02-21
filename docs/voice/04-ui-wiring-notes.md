# UI wiring notes (v0.1)

## Minimal UI requirements
- Toggle Voice (On/Off)
- Mute self (when voice On)

## Suggested state model
- voiceEnabled: boolean
- voiceMuted: boolean
- voiceError?: string

## Where to place
- Table header: mic button
- Settings: voice default on/off (future)

## Peer list source
Use your existing seat snapshot:
- humans only
- connected only (for initial peers)
- ignore bots

Example:
- peerUserIds = seats.filter(s => s.isHuman && s.connected).map(s => s.userId)

Call:
- voice.setPeers(peerUserIds)
whenever snapshot changes.

## Future: per-user mute
- Maintain a mutedPeers Set in VoiceSDK (apply gain node)
- UI: tap opponent -> mute/unmute
