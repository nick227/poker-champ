# Railway Deployment (Split Services)

Target topology:

- `https://poker-champ-web-production.up.railway.app` -> Web static bundle (`apps/client/dist`)
- `https://poker-champ-api-realtime-production.up.railway.app` -> Node API + Colyseus
- `wss://poker-champ-api-realtime-production.up.railway.app` -> Colyseus WebSocket transport

## Service A: `api-realtime`

- Service URL: `https://poker-champ-api-realtime-production.up.railway.app`
- Public networking port: `2567`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start`
- One-off/preview deploy migration command: `pnpm db:migrate`
- Required env:
  - `NODE_ENV=production`
  - `PORT=2567`
  - `DATABASE_URL=mysql://root:vkCfZFkpXAGdFAjsIWnhRafodkjLVLNP@mysql.railway.internal:3306/railway`
  - `CORS_ORIGINS=https://poker-champ-web-production.up.railway.app`
- Optional:
  - `LOG_LEVEL=info`
  - `SESSION_TTL_DAYS=14`
  - `COLYSEUS_LOGLEVEL=info`

## Service B: `web`

- Service URL: `https://poker-champ-web-production.up.railway.app`
- Public networking port: `3000`
- Build command: `pnpm install --frozen-lockfile && pnpm build:web`
- Start command: `pnpm start:web`
- Build-time env baked into Expo export:
  - `PORT=3000`
  - `EXPO_PUBLIC_API_URL=https://poker-champ-api-realtime-production.up.railway.app`
  - `EXPO_PUBLIC_COLYSEUS_URL=wss://poker-champ-api-realtime-production.up.railway.app`
  - `EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus`
  - `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS=false`

## Railway UI Checklist

1. Create Service A from repo, set build/start commands, set port `2567`, set required env vars.
2. Create Service B from same repo, set build/start commands, set port `3000`, set web env vars.
3. Run `pnpm db:migrate` once on Service A after first successful deploy.
4. Open `https://poker-champ-web-production.up.railway.app` and verify API + WS calls hit the API service URL.

## Notes

- Web bundle output is canonical at `apps/client/dist`.
- Static hosting is handled by `tools/static-server.js`.
- `railway.json` only defines builder. Set build/start commands per Railway service in the UI.
- No reverse proxy required for initial rollout.
- Security: rotate the database password after initial setup because it has been shared in plaintext.
