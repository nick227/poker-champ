# Server resource guards (Railway-friendly)

## Why
Voice signaling can be abused (large SDP, spamming ICE). We must fail cheap.

## Guards in v0.1
- Feature flag: if `VOICE_ENABLED !== "1"` drop all VOICE messages.
- Size cap: drop messages > 32KB (JSON stringified).
- Validation: zod schema parses required fields.
- Channel check: only forward if `channelId === room.state.tableId` (or matches computed channel).
- Targeted routing only: no broadcast.
- Rate limit: token bucket per client:
  - default: 20 msgs/sec burst 40 (tunable)
- Strict mode: `VOICE_STRICT=1` throws (dev/test), otherwise log+drop.

## Future guards
- AuthZ: only table members can voice join
- Max peers in channel (reject join)
- Server-provided peer list (more consistent)
