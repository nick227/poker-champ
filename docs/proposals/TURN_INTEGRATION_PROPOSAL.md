# TURN Integration — Analysis & Proposal

## Current state

- **ICE:** `PeerConnectionManager` uses a single hardcoded STUN server: `stun:stun.l.google.com:19302`.
- **Result:** Direct P2P works when NAT/firewall allow it; **no relay**. Connections often fail for:
  - Symmetric NAT / strict corporate firewalls
  - Mobile networks
  - Some home routers

## Why TURN

- **STUN** only helps with discovery (public candidate). It does **not** relay media.
- **TURN** relays media when no direct path exists. Same signaling; only `iceServers` and connectivity change.
- Adding TURN (STUN + TURN in `iceServers`) gives the browser a fallback: try P2P first, then use TURN if ICE fails.

## Analysis

| Aspect | Impact |
|--------|--------|
| **Client** | Single change: pass `RTCConfiguration` (with TURN entries) into `PeerConnectionManager` instead of a hardcoded STUN-only config. |
| **Signaling** | Unchanged. Offer/answer/ICE flow stays the same; TURN is transparent to Colyseus relay. |
| **Server** | No media through our app server. TURN runs on a **separate** TURN server (or 3rd party). |
| **Cost** | TURN relays traffic → bandwidth/cost on the TURN host. STUN-only is free (we use Google’s). |

## Proposal

### 1. Client: configurable ICE config

- **Source of truth:** Server-provided ICE config (recommended) or client env/build-time config.
- **Mechanism:** Add an API or message that returns `iceServers` (e.g. `GET /api/voice/ice-config` or a Colyseus message on room join). Client calls it once per session (or per room) and passes the result into the voice stack.
- **Fallback:** If no config returned or request fails, use current default: `[{ urls: "stun:stun.l.google.com:19302" }]` (STUN-only, no regression).

### 2. PeerConnectionManager

- Accept optional `iceServers` (or full `RTCConfiguration`) in the constructor (or a small “ICE config provider”).
- Build `RTCConfiguration` as: `{ iceServers: provided ?? defaultStunOnly }`.
- No change to offer/answer/ICE signaling logic.

### 3. Server-side TURN (optional)

- **Option A — Managed TURN:** Use a hosted TURN service (e.g. Twilio, Xirsys, Metered, etc.). Client or backend fetches short-lived credentials from that provider; client gets `iceServers` including TURN URLs + credential.
- **Option B — Self-hosted:** Run coturn (or similar) on a VPS. Generate time-limited credentials in our backend; expose an endpoint that returns `iceServers` with TURN URL + username/credential. Keep TURN off the main app host (Railway) to avoid media load and cost.

### 4. Security

- **Credentials:** Prefer short-lived TURN credentials (e.g. 24h) from backend or provider API; avoid long-lived shared secrets in the client.
- **Scope:** Restrict TURN usage to your app (e.g. by origin or auth token) if the TURN server supports it.

### 5. Rollout

- Deploy client change behind the same feature flag as voice (`VOICE_ENABLED` or a dedicated `VOICE_TURN_ENABLED`).
- When the ICE config endpoint is present and returns TURN entries, use them; otherwise keep STUN-only.
- Monitor connection success (e.g. `connectionstate` / `iceconnectionstate`) to confirm TURN is used when needed.

## Implementation checklist

- [ ] **Backend:** Add endpoint or Colyseus message that returns `{ iceServers: [...] }` (and optionally TURN credentials), or integrate with a TURN credential API.
- [ ] **Client:** Fetch ICE config when entering lobby/table (or on voice init); pass into `createVoiceController` / `PeerConnectionManager`.
- [ ] **PeerConnectionManager:** Accept `RTCConfiguration` or `iceServers`; use default STUN-only when absent.
- [ ] **Tests:** Unit test that PCM uses provided `iceServers` when given; fallback to current default when not.
- [ ] **Docs:** Update voice overview to mention TURN and where ICE config is defined.

## Summary

- **Problem:** STUN-only fails for many users behind symmetric NAT/firewalls.
- **Solution:** Add configurable `iceServers` (STUN + TURN); client gets config from backend or env; PCM uses it with a STUN-only fallback.
- **Scope:** Small client change + one backend endpoint (or 3rd-party credential API). No change to signaling or relay logic.
