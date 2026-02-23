# Railway Deployment (Split Services)

Target topology:

- `app.<domain>` -> Web static bundle (`apps/client/dist`)
- `api.<domain>` -> Node API + Colyseus
- `wss://api.<domain>` -> Colyseus WebSocket transport

## Service A: `api-realtime`

- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start`
- One-off/preview deploy migration command: `pnpm db:migrate`
- Required env:
  - `NODE_ENV=production`
  - `DATABASE_URL=...`
  - `CORS_ORIGINS=https://app.<domain>`
- Optional:
  - `COLYSEUS_LOGLEVEL=info`

## Service B: `web`

- Build command: `pnpm install --frozen-lockfile && pnpm -C apps/client build:web`
- Start command: `pnpm start:web`
- Build-time env baked into Expo export:
  - `EXPO_PUBLIC_API_URL=https://api.<domain>`
  - `EXPO_PUBLIC_COLYSEUS_URL=wss://api.<domain>`
  - `EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus`
  - `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS=false`

## Notes

- Web bundle output is canonical at `apps/client/dist`.
- Static hosting is handled by `tools/static-server.js`.
- `railway.json` only defines builder. Set build/start commands per Railway service in the UI.
- No reverse proxy required for initial rollout.
