# Poker Client Scaffold (mobile-first, web+mobile+desktop)

Targets:
- Web (React Native Web via Expo)
- Mobile (iOS/Android via EAS)
- Desktop (Tauri wrapping the web build)

## Quick start (web dev)
```bash
pnpm i
pnpm dev:web
```

## Configure API
Copy `apps/client/.env.example` to `apps/client/.env` and set:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_API_VERSION` (optional)

SDK context is configured in `apps/client/src/bootstrap/sdk.ts`.

## Builds
- Web export: `pnpm build:web`
- Mobile: `pnpm build:ios` / `pnpm build:android`
- Desktop: `pnpm build:desktop`

> Desktop builds require Rust + platform toolchains for Tauri.

## Contract-first local gate
- Canonical command: `pnpm verify`
- Use this as the final pre-push check instead of running individual checks manually.
